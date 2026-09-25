/**
 * Real, end-to-end tests for `serve()` — booting an actual `node:http`
 * server (port 0 → OS-assigned free port, read back from `server.address()`
 * once listening) and hitting it with the real global `fetch`/`WebSocket`,
 * not synthetic in-process calls. Uses Node's own `node:test` runner
 * (not `bun:test`): this package's runtime target is plain Node, so testing
 * it as Node — not as Bun-emulating-Node — is the more honest check, and it
 * avoids the global `Request`/`Response` type clash between `@types/bun`
 * and `@types/node` that a shared TS program would otherwise hit.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Burger } from 'burger-api';
import type { RouteDefinition } from 'burger-api';
import { serve } from '../dist/src/index.js';

function listenOnFreePort(app: Burger): Promise<{
    baseUrl: string;
    close: () => Promise<void>;
}> {
    return new Promise((resolve, reject) => {
        const server = serve(app, { port: 0 });
        server.on('error', reject);
        server.on('listening', () => {
            const address = server.address() as AddressInfo;
            resolve({
                baseUrl: `http://127.0.0.1:${address.port}`,
                close: () =>
                    new Promise<void>((res, rej) => {
                        server.close((err) => (err ? rej(err) : res()));
                    }),
            });
        });
    });
}

const apiRoutes: RouteDefinition[] = [
    {
        path: '/api/hello',
        handlers: {
            GET: () => Response.json({ message: 'hello' }),
        },
    },
    {
        path: '/api/echo',
        handlers: {
            POST: async (ctx) => {
                const body = await ctx.request.json();
                return Response.json(body, { status: 201 });
            },
        },
    },
];

describe('serve() — plain HTTP', () => {
    test('handles GET/POST/404 over a real node:http server', async () => {
        const app = new Burger({ apiRoutes });
        const { baseUrl, close } = await listenOnFreePort(app);
        try {
            const res1 = await fetch(`${baseUrl}/api/hello`);
            assert.equal(res1.status, 200);
            assert.deepEqual(await res1.json(), { message: 'hello' });

            const res2 = await fetch(`${baseUrl}/api/echo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ a: 1 }),
            });
            assert.equal(res2.status, 201);
            assert.deepEqual(await res2.json(), { a: 1 });

            const res3 = await fetch(`${baseUrl}/api/nope`);
            assert.equal(res3.status, 404);
        } finally {
            await close();
        }
    });

    test('an app with no WebSocket routes still just works as plain HTTP', async () => {
        const app = new Burger({ apiRoutes });
        const { baseUrl, close } = await listenOnFreePort(app);
        try {
            const res = await fetch(`${baseUrl}/api/hello`);
            assert.equal(res.status, 200);
        } finally {
            await close();
        }
    });
});

describe('serve() — WebSocket bridge', () => {
    test('wires WebSocket routes automatically via createNodeWsBridge', async () => {
        const clients = new Set<{ send(data: string): void }>();
        const app = new Burger({
            apiRoutes,
            wsRoutes: [
                {
                    path: '/chat',
                    handlers: {
                        open(ws) {
                            clients.add(ws);
                            ws.sendText('connected');
                        },
                        message(ws, message) {
                            for (const client of clients) {
                                if (client !== ws) client.send(String(message));
                            }
                        },
                        close(ws) {
                            clients.delete(ws);
                        },
                    },
                },
            ],
        });

        const { baseUrl, close } = await listenOnFreePort(app);
        try {
            const wsUrl = baseUrl.replace('http://', 'ws://') + '/chat';

            const connect = () =>
                new Promise<{ ws: WebSocket; received: string[] }>(
                    (resolve, reject) => {
                        const ws = new WebSocket(wsUrl);
                        const received: string[] = [];
                        ws.addEventListener('message', (e) =>
                            received.push(String(e.data))
                        );
                        ws.addEventListener('open', () =>
                            resolve({ ws, received })
                        );
                        ws.addEventListener('error', reject);
                    }
                );

            const a = await connect();
            const b = await connect();
            await new Promise((r) => setTimeout(r, 100));

            a.ws.send('hello from a');
            await new Promise((r) => setTimeout(r, 200));

            assert.deepEqual(a.received, ['connected']);
            assert.deepEqual(b.received, ['connected', 'hello from a']);

            a.ws.close();
            b.ws.close();
        } finally {
            await close();
        }
    });
});
