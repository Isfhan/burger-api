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

describe('WebSocket prebuilt routes (production path)', () => {
    let server: Burger | null = null;

    afterAll(async () => {
        const srv = server as any;
        if (srv?.getServer) {
            srv.getServer()?.stop();
        }
        server = null;
    });

    it('serves prebuilt wsRoutes without filesystem scanning', async () => {
        const port = await getAvailablePort();

        server = new Burger({
            debug: true,
            wsRoutes: [
                {
                    path: '/echo',
                    handlers: {
                        open(ws: BurgerWS) {
                            ws.send(JSON.stringify({ type: 'connected' }));
                        },
                        message(ws: BurgerWS, message: string | Buffer) {
                            ws.send(
                                JSON.stringify({
                                    type: 'echo',
                                    data: message.toString(),
                                })
                            );
                        },
                    },
                },
            ],
        });

        await server.serve(port);

        const ws = new WebSocket(`ws://localhost:${port}/echo`);
        await waitForOpen(ws);

        const connected = JSON.parse(await waitForMessage(ws));
        expect(connected.type).toBe('connected');

        ws.send(JSON.stringify({ text: 'hello' }));
        const echo = JSON.parse(await waitForMessage(ws));
        expect(echo.type).toBe('echo');
        expect(echo.data).toBe(JSON.stringify({ text: 'hello' }));

        ws.close();
    });

    it('matches dynamic :param routes in prebuilt wsRoutes', async () => {
        const port = await getAvailablePort();

        server = new Burger({
            debug: true,
            wsRoutes: [
                {
                    path: '/rooms/:roomId',
                    handlers: {
                        message(ws: BurgerWS, message: string | Buffer) {
                            const roomId = (ws.data.route?.params as
                                | Record<string, string>
                                | undefined)?.roomId;
                            ws.send(
                                JSON.stringify({
                                    type: 'room',
                                    roomId,
                                    data: message.toString(),
                                })
                            );
                        },
                    },
                },
            ],
        });

        await server.serve(port);

        const ws = new WebSocket(`ws://localhost:${port}/rooms/42`);
        await waitForOpen(ws);

        ws.send('hello room');
        const room = JSON.parse(await waitForMessage(ws));
        expect(room.type).toBe('room');
        expect(room.roomId).toBe('42');
        expect(room.data).toBe('hello room');

        ws.close();
    });

    it('merges global wsConfig with prebuilt route config', async () => {
        const port = await getAvailablePort();

        let rejected = false;
        const beforeRouteHook = () => {
            rejected = true;
            return new Response('auth required', { status: 401 });
        };

        server = new Burger({
            debug: true,
            // Production path (mirrors CLI virtual entry output: apiRoutes is
            // always emitted, and pluginsModule only executes when it is).
            apiRoutes: [],
            // A plugin beforeRoute hook rejects upgrades when auth is enabled.
            pluginsModule: {
                default: (burger: Burger) =>
                    burger.usePlugin({
                        name: 'auth-guard',
                        hooks: {
                            beforeRoute: [beforeRouteHook],
                        },
                    }),
            },
            wsRoutes: [
                {
                    path: '/public',
                    config: { auth: false },
                    handlers: {
                        message(ws: BurgerWS, message: string | Buffer) {
                            ws.send(message.toString());
                        },
                    },
                },
                {
                    path: '/secure',
                    handlers: {
                        message(ws: BurgerWS, message: string | Buffer) {
                            ws.send(message.toString());
                        },
                    },
                },
            ],
        });
        server.wsConfig({ auth: { required: true } });

        await server.serve(port);

        // Route-level `auth: false` survives the merge — upgrade succeeds.
        const publicWs = new WebSocket(`ws://localhost:${port}/public`);
        await waitForOpen(publicWs);
        publicWs.send('ping');
        expect(await waitForMessage(publicWs)).toBe('ping');
        expect(rejected).toBe(false);
        publicWs.close();

        // Global auth config applies where the route does not opt out —
        // the upgrade is rejected before the connection opens.
        const secureWs = new WebSocket(`ws://localhost:${port}/secure`);
        const closed = await new Promise<boolean>((resolve) => {
            secureWs.onclose = () => resolve(true);
            secureWs.onopen = () => resolve(false);
            setTimeout(() => resolve(false), 2000);
        });
        expect(closed).toBe(true);
        expect(rejected).toBe(true);
    });
});
