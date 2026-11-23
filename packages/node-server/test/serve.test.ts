/**
 * End-to-end tests for `serve()`: boot a real `node:http` server on port 0
 * and hit it with the global `fetch`/`WebSocket`, not synthetic in-process
 * calls. Runs on Node's `node:test` (this package targets plain Node) to
 * avoid the `@types/bun`/`@types/node` Request type clash.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
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

/** Sends a raw HTTP/1.1 request and returns the full response text. */
function rawRequest(port: number, request: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () =>
            socket.write(request)
        );
        let data = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk) => (data += chunk));
        socket.on('end', () => resolve(data));
        socket.on('error', reject);
        socket.setTimeout(2000, () => {
            socket.destroy();
            resolve(data);
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

describe('serve() — request target and Host validation', () => {
    function makeProxyApp(): Burger {
        return new Burger({
            apiRoutes: [
                {
                    path: '/public',
                    handlers: {
                        GET: (ctx) =>
                            Response.json({ route: 'public', url: ctx.url }),
                    },
                },
                {
                    path: '/admin',
                    handlers: {
                        GET: () => Response.json({ route: 'ADMIN' }),
                    },
                },
            ],
        });
    }

    test('a path in Host cannot override the request target', async () => {
        const { baseUrl, close } = await listenOnFreePort(makeProxyApp());
        const port = Number(new URL(baseUrl).port);
        try {
            const response = await rawRequest(
                port,
                'GET /public HTTP/1.1\r\nHost: example.com/admin?\r\nConnection: close\r\n\r\n'
            );
            assert.match(response, /^HTTP\/1\.1 400 /);
            assert.ok(!response.includes('ADMIN'));
        } finally {
            await close();
        }
    });

    test('absolute-form targets route by pathname, not the full URL', async () => {
        const { baseUrl, close } = await listenOnFreePort(makeProxyApp());
        const port = Number(new URL(baseUrl).port);
        try {
            const response = await rawRequest(
                port,
                'GET http://example.com/public HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n'
            );
            assert.match(response, /^HTTP\/1\.1 200 /);
            assert.ok(response.includes('"route":"public"'));
            assert.ok(response.includes('"url":"http://example.com/public"'));
        } finally {
            await close();
        }
    });

    test('an invalid Host gets 400 instead of a thrown 500', async () => {
        const { baseUrl, close } = await listenOnFreePort(makeProxyApp());
        const port = Number(new URL(baseUrl).port);
        try {
            const response = await rawRequest(
                port,
                'GET /public HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n'
            );
            assert.match(response, /^HTTP\/1\.1 400 /);
        } finally {
            await close();
        }
    });

    test('accepts an IPv6 Host with a port', async () => {
        const { baseUrl, close } = await listenOnFreePort(makeProxyApp());
        const port = Number(new URL(baseUrl).port);
        try {
            const response = await rawRequest(
                port,
                'GET /public HTTP/1.1\r\nHost: [::1]:3000\r\nConnection: close\r\n\r\n'
            );
            assert.match(response, /^HTTP\/1\.1 200 /);
            assert.ok(response.includes('"route":"public"'));
        } finally {
            await close();
        }
    });
});

describe('serve() — client disconnect', () => {
    test('aborts the request and cancels the body stream', async () => {
        let ticks = 0;
        let aborted = false;
        let cancelled = false;
        let markAborted!: () => void;
        let markCancelled!: () => void;
        const abortSeen = new Promise<void>((resolve) => {
            markAborted = resolve;
        });
        const cancelSeen = new Promise<void>((resolve) => {
            markCancelled = resolve;
        });

        const app = new Burger({
            apiRoutes: [
                {
                    path: '/api/sse',
                    handlers: {
                        GET: (ctx) => {
                            ctx.request.signal.addEventListener(
                                'abort',
                                () => {
                                    aborted = true;
                                    markAborted();
                                },
                                { once: true }
                            );
                            return new Response(
                                new ReadableStream({
                                    async pull(controller) {
                                        ticks++;
                                        await new Promise((r) =>
                                            setTimeout(r, 10)
                                        );
                                        controller.enqueue(
                                            new TextEncoder().encode(
                                                'data: x\n\n'
                                            )
                                        );
                                    },
                                    cancel() {
                                        cancelled = true;
                                        markCancelled();
                                    },
                                }),
                                {
                                    headers: {
                                        'content-type': 'text/event-stream',
                                    },
                                }
                            );
                        },
                    },
                },
            ],
        });

        const { baseUrl, close } = await listenOnFreePort(app);
        const port = Number(new URL(baseUrl).port);
        const socket = net.connect(port, '127.0.0.1', () => {
            socket.write(
                'GET /api/sse HTTP/1.1\r\nHost: localhost\r\n\r\n'
            );
        });
        try {
            await new Promise<void>((resolve, reject) => {
                socket.once('data', () => resolve());
                socket.once('error', reject);
                setTimeout(resolve, 1000);
            });
            socket.destroy();

            await Promise.race([
                abortSeen,
                new Promise((r) => setTimeout(r, 1000)),
            ]);
            assert.equal(aborted, true);

            await Promise.race([
                cancelSeen,
                new Promise((r) => setTimeout(r, 1000)),
            ]);
            assert.equal(cancelled, true);

            const after = ticks;
            await new Promise((r) => setTimeout(r, 100));
            assert.ok(
                ticks <= after + 1,
                `stream kept pulling after disconnect: ${after} -> ${ticks}`
            );
        } finally {
            socket.destroy();
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

describe('serve() — response headers and HEAD', () => {
    test('keeps every Set-Cookie header', async () => {
        const app = new Burger({
            apiRoutes: [
                {
                    path: '/api/cookies',
                    handlers: {
                        GET: () => {
                            const headers = new Headers();
                            headers.append('set-cookie', 'a=1; Path=/');
                            headers.append('set-cookie', 'b=2; Path=/');
                            return new Response('ok', { headers });
                        },
                    },
                },
            ],
        });
        const { baseUrl, close } = await listenOnFreePort(app);
        try {
            const res = await fetch(`${baseUrl}/api/cookies`);
            assert.deepEqual(res.headers.getSetCookie(), [
                'a=1; Path=/',
                'b=2; Path=/',
            ]);
        } finally {
            await close();
        }
    });

    test('HEAD sends no body and cancels a never-ending stream', async () => {
        let cancelled = false;
        const app = new Burger({
            apiRoutes: [
                {
                    path: '/api/events',
                    handlers: {
                        GET: () =>
                            new Response(
                                new ReadableStream({
                                    pull: () =>
                                        new Promise((r) => setTimeout(r, 5)),
                                    cancel() {
                                        cancelled = true;
                                    },
                                }),
                                {
                                    headers: {
                                        'content-type': 'text/event-stream',
                                    },
                                }
                            ),
                    },
                },
            ],
        });
        const { baseUrl, close } = await listenOnFreePort(app);
        try {
            const res = await fetch(`${baseUrl}/api/events`, {
                method: 'HEAD',
                signal: AbortSignal.timeout(2000),
            });
            assert.equal(res.status, 200);
            assert.equal(res.headers.get('content-type'), 'text/event-stream');
            assert.equal(await res.text(), '');
            for (let i = 0; i < 50 && !cancelled; i++) {
                await new Promise((r) => setTimeout(r, 10));
            }
            assert.equal(cancelled, true);
        } finally {
            await close();
        }
    });
});
