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
        const timer = setTimeout(() => reject(new Error('WebSocket open timed out')), timeoutMs);
        ws.onopen = () => {
            clearTimeout(timer);
            resolve();
        };
    });
}

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket message timed out')), timeoutMs);
        ws.onmessage = (event) => {
            clearTimeout(timer);
            resolve(typeof event.data === 'string' ? event.data : event.data.toString());
        };
    });
}

function waitForClose(ws: WebSocket, timeoutMs = 3000): Promise<{ code: number; reason: string }> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket close timed out')), timeoutMs);
        ws.onclose = (event) => {
            clearTimeout(timer);
            resolve({ code: event.code, reason: event.reason });
        };
    });
}

describe('WebSocket integration (Phase 9)', () => {
    let server: Burger | null = null;
    let port: number;

    afterAll(async () => {
        const srv = (server as any);
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
                ws.send(JSON.stringify({ type: 'echo', data: message.toString() }));
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

        let closedCode: number | null = null;

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
                ws.send(JSON.stringify({ room: (ws as any).data?.route?.params?.roomName }));
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

        // HTTP request should still work via the normal router
        // (no apiDir set, so it'll return 404, but it shouldn't crash)
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
});
