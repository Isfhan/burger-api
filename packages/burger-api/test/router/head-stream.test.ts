import { describe, it, expect, afterEach } from 'bun:test';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';

// Auto-HEAD returns GET's response as-is and never reads its body. The server
// drops the body on the wire: Bun reports the size of a buffered body and
// cancels a stream.
let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => {
    server?.stop(true);
    server = undefined;
});

function serveRoutes(defs: RouteDefinition[]): string {
    const router = new Router();
    router.compile(defs);
    server = Bun.serve({ port: 0, fetch: (req) => router.fetch(req) });
    return `http://127.0.0.1:${server.port}`;
}

describe('auto-HEAD never reads the GET body', () => {
    it('returns promptly for a never-ending stream', async () => {
        const router = new Router();
        router.compile([
            {
                path: '/stream',
                handlers: {
                    GET: () => new Response(new ReadableStream({ start() {} })),
                },
            } as never,
        ]);
        const res = await Promise.race([
            router.fetch(new Request('http://t/stream', { method: 'HEAD' })),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('HEAD hung')), 1000)
            ),
        ]);
        expect(res.status).toBe(200);
        expect(res.bodyUsed).toBe(false);
    });

    it('sends the size of a buffered body and no body over Bun.serve', async () => {
        const base = serveRoutes([
            {
                path: '/buffered',
                handlers: { GET: () => new Response('hello world') },
            } as never,
        ]);
        const res = await fetch(`${base}/buffered`, { method: 'HEAD' });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-length')).toBe('11');
        expect(await res.text()).toBe('');
    });

    it('cancels a never-ending stream over Bun.serve', async () => {
        let cancelled = false;
        const base = serveRoutes([
            {
                path: '/events',
                handlers: {
                    GET: () =>
                        new Response(
                            new ReadableStream({
                                pull: () => Bun.sleep(5),
                                cancel() {
                                    cancelled = true;
                                },
                            }),
                            { headers: { 'content-type': 'text/event-stream' } }
                        ),
                },
            } as never,
        ]);
        const res = await fetch(`${base}/events`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(2000),
        });
        expect(res.headers.get('content-type')).toBe('text/event-stream');
        expect(await res.text()).toBe('');
        for (let i = 0; i < 50 && !cancelled; i++) await Bun.sleep(10);
        expect(cancelled).toBe(true);
    });

    it('keeps an explicit Content-Length', async () => {
        const base = serveRoutes([
            {
                path: '/explicit',
                handlers: {
                    GET: () =>
                        new Response(new ReadableStream({ start() {} }), {
                            headers: { 'content-length': '42' },
                        }),
                },
            } as never,
        ]);
        const res = await fetch(`${base}/explicit`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(2000),
        });
        expect(res.headers.get('content-length')).toBe('42');
    });
});
