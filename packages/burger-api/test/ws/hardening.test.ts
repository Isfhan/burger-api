/**
 * WS adapter hardening: config forwarded to Bun, async rejections don't
 * crash, per-connection state survives, roles enforced, deep auth merge.
 */
import { describe, it, expect, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'net';
import { Burger } from '../../src/index';
import { WebSocketAdapter } from '../../src/ws/adapter';
import { WebSocketRouter } from '../../src/ws/router';
import { WebSocketCompiler } from '../../src/ws/compiler';
import type { BurgerWS, CompiledWebSocketRoute } from '../../src/ws/types';
import type { ScannedWebSocketRoute } from '../../src/ws/scanner';

function getAvailablePort(): Promise<number> {
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

const createRoute = (
    path: string,
    overrides: Partial<CompiledWebSocketRoute> = {}
): CompiledWebSocketRoute => ({
    path,
    handlers: {},
    config: {},
    ...overrides,
});

describe('WS hardening', () => {
    let server: Burger | null = null;
    let port: number;

    afterAll(async () => {
        const srv = server as any;
        if (srv?.getServer) {
            srv.getServer()?.stop();
        }
        server = null;
    });

    it('a rejecting message handler does not kill the server; close still fires', async () => {
        port = await getAvailablePort();
        let resolveServerClose!: (value: unknown) => void;
        const serverClose = new Promise((resolve) => {
            resolveServerClose = resolve;
        });
        server = new Burger({ debug: false });
        server.websocket('/boom', {
            message() {
                throw new Error('handler boom');
            },
            close() {
                resolveServerClose(true);
            },
        });
        await server.serve(port);

        const ws1 = new WebSocket(`ws://localhost:${port}/boom`);
        await waitForOpen(ws1);
        ws1.send('trigger');
        await Bun.sleep(200);

        // Server is still alive — a second connection succeeds.
        const ws2 = new WebSocket(`ws://localhost:${port}/boom`);
        await waitForOpen(ws2);
        ws2.close();

        ws1.close();
        const close = await waitForClose(ws1);
        expect(close.code).toBe(1000);
        expect(await serverClose).toBe(true);
    });

    it('state set in open survives into message and close', async () => {
        port = await getAvailablePort();
        let resolveServerClose!: (value: unknown) => void;
        const serverClose = new Promise((resolve) => {
            resolveServerClose = resolve;
        });
        server = new Burger({ debug: false });
        server.websocket('/state', {
            open(ws) {
                (ws.data as Record<string, unknown>).userId = 'u1';
            },
            message(ws, msg) {
                ws.send(
                    `id:${(ws.data as Record<string, unknown>).userId}:${msg}`
                );
            },
            close(ws) {
                resolveServerClose(
                    (ws.data as Record<string, unknown>).userId
                );
            },
        });
        await server.serve(port);

        const ws = new WebSocket(`ws://localhost:${port}/state`);
        await waitForOpen(ws);
        ws.send('hello');
        expect(await waitForMessage(ws)).toBe('id:u1:hello');
        ws.close();
        await waitForClose(ws);
        expect(await serverClose).toBe('u1');
    });

    it('auth.roles without a jwt plugin rejects non-admin upgrades with 403', async () => {
        const router = new WebSocketRouter();
        router.addRoute(
            createRoute('/admin', {
                config: { auth: { required: true, roles: ['admin'] } },
            })
        );
        const adapter = new WebSocketAdapter({
            router,
            pluginBeforeRoute: [
                (ctx) => {
                    (ctx as any).user = { roles: ['user'] };
                },
            ],
        });
        const request = new Request('http://h/admin', {
            headers: { upgrade: 'websocket', connection: 'Upgrade' },
        });
        const mockServer = { upgrade: () => true };
        const res = await adapter.createFetchHandler()(
            request,
            mockServer as any
        );
        expect(res).toBeInstanceOf(Response);
        expect((res as Response).status).toBe(403);
    });

    it('upgrade succeeds for an admin-role user', async () => {
        const router = new WebSocketRouter();
        router.addRoute(
            createRoute('/admin', {
                config: { auth: { required: true, roles: ['admin'] } },
            })
        );
        const adapter = new WebSocketAdapter({
            router,
            pluginBeforeRoute: [
                (ctx) => {
                    (ctx as any).user = { roles: ['admin'] };
                },
            ],
        });
        const request = new Request('http://h/admin', {
            headers: { upgrade: 'websocket', connection: 'Upgrade' },
        });
        let upgraded = false;
        const mockServer = {
            upgrade: (_req: Request, opts: { data: unknown }) => {
                upgraded = true;
                expect((opts.data as Record<string, unknown>).user).toBeDefined();
                return true;
            },
        };
        const res = await adapter.createFetchHandler()(
            request,
            mockServer as any
        );
        expect(res).toBeUndefined();
        expect(upgraded).toBe(true);
    });

    it('route auth.roles preserves global auth.required (deep merge)', async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'burger-ws-cfg-'));
        try {
            writeFileSync(
                join(tempDir, 'ws.ts'),
                'export const message = (ws, msg) => {};'
            );
            const compiler = new WebSocketCompiler();
            compiler.setGlobalConfig({ auth: { required: true } });
            const scanned: ScannedWebSocketRoute = {
                path: '/chat',
                wsFile: join(tempDir, 'ws.ts'),
            };
            const compiled = await compiler.compile(scanned);
            const auth = compiled.config.auth as {
                required?: boolean;
                roles?: string[];
            };
            expect(auth.required).toBe(true);
            expect(auth.roles).toBeUndefined();
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('forwards maxPayloadLength to Bun.serve so oversized frames close', async () => {
        port = await getAvailablePort();
        server = new Burger({ debug: false });
        server.wsConfig({ maxPayloadLength: 2048 });
        server.websocket('/big', {
            message() {},
        });
        await server.serve(port);

        const ws = new WebSocket(`ws://localhost:${port}/big`);
        await waitForOpen(ws);
        ws.send('x'.repeat(64 * 1024));
        const close = await waitForClose(ws);
        // Bun enforces the limit by aborting the connection; the client
        // sees an abnormal closure (1006) or MESSAGE_TOO_BIG (1009).
        expect([1006, 1009]).toContain(close.code);
    });

    it('rejecting async handlers are awaited so rejections never escape', async () => {
        const router = new WebSocketRouter();
        router.addRoute(
            createRoute('/async', {
                handlers: {
                    message: async () => {
                        throw new Error('async boom');
                    },
                    close: () => {},
                },
            })
        );
        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();
        const mockWs = {
            data: { route: router.match('/async')!.route },
            send: () => {},
            close: () => {},
        };
        await wsOption.message(mockWs, 'hello');
    });
});