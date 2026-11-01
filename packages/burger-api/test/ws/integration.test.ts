import { describe, it, expect, afterAll } from 'bun:test';
import { createServer } from 'net';
import { Burger } from '../../src/index';
import type { BurgerWS } from '../../src/ws/types';

async function getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('Failed to allocate port'));
                return;
            }
            const { port } = address;
            server.close(() => resolve(port));
        });
    });
}

function waitForOpen(ws: WebSocket, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('WebSocket open timed out')),
            timeoutMs
        );
        ws.onopen = () => {
            clearTimeout(timer);
            resolve();
        };
    });
}

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('WebSocket message timed out')),
            timeoutMs
        );
        ws.onmessage = (event) => {
            clearTimeout(timer);
            resolve(
                typeof event.data === 'string'
                    ? event.data
                    : event.data.toString()
            );
        };
    });
}

function waitForClose(
    ws: WebSocket,
    timeoutMs = 3000
): Promise<{ code: number; reason: string }> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('WebSocket close timed out')),
            timeoutMs
        );
        ws.onclose = (event) => {
            clearTimeout(timer);
            resolve({ code: event.code, reason: event.reason });
        };
    });
}

describe('WebSocket integration', () => {
    let server: Burger | null = null;
    let port: number;

    afterAll(async () => {
        const srv = server as any;
        if (srv?.getServer) {
            srv.getServer()?.stop();
        }
        server = null;
    });

    it('programmatic route: echo', async () => {
        port = await getAvailablePort();

        server = new Burger({ debug: true });
        server.websocket('/echo', {
            open(ws: BurgerWS) {
                ws.send(JSON.stringify({ type: 'connected' }));
            },
            message(ws: BurgerWS, message: string | Buffer) {
                ws.send(
                    JSON.stringify({ type: 'echo', data: message.toString() })
                );
            },
        });

        await server.serve(port);

        // Connect
        const ws = new WebSocket(`ws://localhost:${port}/echo`);
        await waitForOpen(ws);

        // Should receive connected message
        const connected = JSON.parse(await waitForMessage(ws));
        expect(connected.type).toBe('connected');

        // Send a message and expect echo
        ws.send(JSON.stringify({ text: 'hello' }));
        const echo = JSON.parse(await waitForMessage(ws));
        expect(echo.type).toBe('echo');
        expect(echo.data).toBe(JSON.stringify({ text: 'hello' }));

        ws.close();
    });

    it('programmatic route: close event', async () => {
        port = await getAvailablePort();

        let closedCode: any = null;

        server = new Burger({ debug: true });
        server.websocket('/close-test', {
            open(_ws: BurgerWS) {},
            close(_ws: BurgerWS, code: number, _reason: string) {
                closedCode = code;
            },
        });

        await server.serve(port);

        const ws = new WebSocket(`ws://localhost:${port}/close-test`);
        await waitForOpen(ws);

        ws.close(1000, 'done');
        const result = await waitForClose(ws);
        expect(result.code).toBe(1000);

        // Give a moment for the server-side close handler to fire
        await Bun.sleep(100);
        expect(closedCode).toBe(1000);
    });

    it('programmatic route: dynamic param', async () => {
        port = await getAvailablePort();

        server = new Burger({ debug: true });
        server.websocket('/room/:roomName', {
            open(ws: BurgerWS) {
                ws.send(
                    JSON.stringify({
                        room: ws.params.roomName,
                    })
                );
            },
        });

        await server.serve(port);

        const ws = new WebSocket(`ws://localhost:${port}/room/general`);
        await waitForOpen(ws);

        const msg = JSON.parse(await waitForMessage(ws));
        // The params are set by the adapter during upgrade
        expect(msg.room).toBe('general');

        ws.close();
    });

    it('programmatic route: ws.url and ws.query', async () => {
        port = await getAvailablePort();

        server = new Burger({ debug: true });
        server.websocket('/inspect/:room', {
            open(ws: BurgerWS) {
                ws.send(
                    JSON.stringify({
                        pathname: ws.url.pathname,
                        room: ws.params.room,
                        queryRoom: ws.query.get('room'),
                    })
                );
            },
        });

        await server.serve(port);

        const ws = new WebSocket(
            `ws://localhost:${port}/inspect/lobby?room=general&x=1`
        );
        await waitForOpen(ws);

        const msg = JSON.parse(await waitForMessage(ws));
        expect(msg.pathname).toBe('/inspect/lobby');
        expect(msg.room).toBe('lobby');
        expect(msg.queryRoom).toBe('general');

        ws.close();
    });

    it('HTTP routes still work alongside WebSocket', async () => {
        port = await getAvailablePort();

        server = new Burger({ debug: true });

        // Register a programmatic WebSocket route
        server.websocket('/ws-alive', {
            open(ws: BurgerWS) {
                ws.send('alive');
            },
        });

        await server.serve(port);

        // HTTP still routed normally; no apiDir means 404, not a crash.
        const res = await fetch(`http://localhost:${port}/anything`);
        // No routes configured → 404
        expect(res.status).toBe(404);

        // WebSocket should also work
        const ws = new WebSocket(`ws://localhost:${port}/ws-alive`);
        await waitForOpen(ws);

        const msg = await waitForMessage(ws);
        expect(msg).toBe('alive');

        ws.close();
    });

    it('ctx.publish delivers to topic subscribers (HTTP route → WS client)', async () => {
        port = await getAvailablePort();

        server = new Burger({
            debug: true,
            apiRoutes: [
                {
                    path: '/api/broadcast',
                    handlers: {
                        POST: (ctx) => {
                            const sent = ctx.publish('room', 'hello-room');
                            return Response.json({ sent });
                        },
                    },
                },
            ],
        });
        server.websocket('/sub', {
            open(ws: BurgerWS) {
                ws.subscribe('room');
                ws.send('subscribed');
            },
        });

        await server.serve(port);

        const ws = new WebSocket(`ws://localhost:${port}/sub`);
        await waitForOpen(ws);
        expect(await waitForMessage(ws)).toBe('subscribed');

        // Arm the listener before the POST so a fast delivery is not missed.
        const roomMessage = waitForMessage(ws);
        const res = await fetch(
            `http://localhost:${port}/api/broadcast`,
            { method: 'POST' }
        );
        expect(res.status).toBe(200);
        // Bun reports a send status; the message must have been delivered.
        expect(typeof (await res.json()).sent).toBe('number');

        expect(await roomMessage).toBe('hello-room');
        ws.close();
    });

    it('ctx.publish fails loud on the fetch path (no Bun server)', async () => {
        const app = new Burger({
            apiRoutes: [
                {
                    path: '/api/pub-error',
                    handlers: {
                        GET: (ctx) => {
                            try {
                                ctx.publish('room', 'x');
                                return Response.json({ message: 'no error' });
                            } catch (error) {
                                return Response.json({
                                    message: (error as Error).message,
                                });
                            }
                        },
                    },
                },
            ],
        });
        const handler = await app.fetchHandler();

        const res = await handler(
            new Request('http://localhost/api/pub-error')
        );
        const body = await res.json();
        expect(body.message).toContain('ctx.publish("room")');
        expect(body.message).toContain('app.serve()');
    });
});
