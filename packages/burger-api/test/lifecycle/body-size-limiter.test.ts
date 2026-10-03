/**
 * Body size limiter hook: bounded streaming, body preservation,
 * header-mode enforcement.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import type { ForwardHook } from '../../src/lifecycle/types';
import { bodySizeLimiter } from '../../../../ecosystem/hooks/body-size-limiter/body-size-limiter';

function makeBurger(limiter: ReturnType<typeof bodySizeLimiter>) {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api/echo',
                handlers: {
                    POST: async (ctx: unknown) => {
                        const body = await (ctx as { text(): Promise<string> }).text();
                        return Response.json({ length: body.length });
                    },
                },
                openapi: {},
            },
        ],
    });
    burger.usePlugin({
        name: 'body-size-test',
        hooks: { beforeRoute: limiter as unknown as ForwardHook },
    });
    return burger;
}

describe('body-size-limiter', () => {
    it('stream mode: rejects oversized bodies and stops reading', async () => {
        const burger = makeBurger(bodySizeLimiter({ maxSize: 100, mode: 'stream' }));
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/echo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'x'.repeat(500),
            })
        );
        expect(res.status).toBe(413);
    });

    it('stream mode: preserves the body for the handler when under the limit', async () => {
        const burger = makeBurger(bodySizeLimiter({ maxSize: 1000, mode: 'stream' }));
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/echo', {
                method: 'POST',
                body: 'hello world',
            })
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ length: 11 });
    });

    it('stream mode: rejects oversized chunked bodies without Content-Length', async () => {
        const burger = makeBurger(bodySizeLimiter({ maxSize: 100, mode: 'stream' }));
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/echo', {
                method: 'POST',
                body: new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('a'.repeat(300)));
                        controller.close();
                    },
                }),
            })
        );
        expect(res.status).toBe(413);
    });

    it('header mode: rejects oversized Content-Length', async () => {
        const burger = makeBurger(bodySizeLimiter({ maxSize: 100, mode: 'header' }));
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/echo', {
                method: 'POST',
                headers: { 'Content-Length': '500' },
                body: 'x'.repeat(500),
            })
        );
        expect(res.status).toBe(413);
    });

    it('header mode: rejects invalid Content-Length values', async () => {
        const burger = makeBurger(bodySizeLimiter({ maxSize: 100, mode: 'header' }));
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/echo', {
                method: 'POST',
                headers: { 'Content-Length': '+5' },
                body: 'xxxxx',
            })
        );
        expect(res.status).toBe(400);
    });

    it('header mode: requires Content-Length when a body is present (chunked bypass)', async () => {
        const burger = makeBurger(bodySizeLimiter({ maxSize: 100, mode: 'header' }));
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/echo', {
                method: 'POST',
                body: new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('a'.repeat(50)));
                        controller.close();
                    },
                }),
            })
        );
        expect(res.status).toBe(411);
    });

    it('header mode: accepts an in-limit body with a valid Content-Length', async () => {
        const burger = makeBurger(bodySizeLimiter({ maxSize: 100, mode: 'header' }));
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/echo', {
                method: 'POST',
                headers: { 'Content-Length': '5' },
                body: 'hello',
            })
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ length: 5 });
    });
});