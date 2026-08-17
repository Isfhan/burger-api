/**
 * Rate limiter hook: trusted-proxy keying, no shared fallback bucket,
 * full-length key hashing.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import type { ForwardHook } from '../../src/lifecycle/types';
import { rateLimit, hashKey } from '../../../../ecosystem/hooks/rate-limiter/rate-limiter';

function makeBurger(limiter: ReturnType<typeof rateLimit>) {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api',
                handlers: { GET: () => Response.json({ ok: true }) },
                openapi: {},
            },
        ],
    });
    burger.usePlugin({
        name: 'rate-limit-test',
        hooks: { beforeRoute: limiter as unknown as ForwardHook },
    });
    return burger;
}

describe('rate-limiter', () => {
    it('trusted proxy: enforces the limit per X-Forwarded-For client', async () => {
        const burger = makeBurger(rateLimit({ maxRequests: 3, trustProxy: true }));
        const handler = await burger.fetchHandler();
        const statuses: number[] = [];
        for (let i = 0; i < 4; i++) {
            const res = await handler(
                new Request('http://localhost/api', {
                    headers: { 'X-Forwarded-For': '203.0.113.7' },
                })
            );
            statuses.push(res.status);
        }
        expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
        expect(statuses[3]).toBe(429);
    });

    it('trusted proxy: distinct X-Forwarded-For clients get distinct buckets', async () => {
        const burger = makeBurger(rateLimit({ maxRequests: 3, trustProxy: true }));
        const handler = await burger.fetchHandler();
        for (let i = 0; i < 4; i++) {
            await handler(
                new Request('http://localhost/api', {
                    headers: { 'X-Forwarded-For': '203.0.113.7' },
                })
            );
        }
        const other = await handler(
            new Request('http://localhost/api', {
                headers: { 'X-Forwarded-For': '198.51.100.9' },
            })
        );
        expect(other.status).toBe(200);
    });

    it('spoofed X-Forwarded-For is ignored without trustProxy', async () => {
        const burger = makeBurger(rateLimit({ maxRequests: 3 }));
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api', {
                headers: { 'X-Forwarded-For': '203.0.113.7' },
            })
        );
        expect(res.status).toBe(403);
    });

    it('no identity source does not create a shared fallback bucket', async () => {
        const burger = makeBurger(rateLimit({ maxRequests: 3, trustProxy: true }));
        const handler = await burger.fetchHandler();
        const res = await handler(new Request('http://localhost/api'));
        expect(res.status).toBe(403);
    });

    it('custom keyGenerator still enforces the limit', async () => {
        const burger = makeBurger(
            rateLimit({
                maxRequests: 2,
                keyGenerator: (ctx) => ctx.headers.get('X-API-Key') ?? 'anon',
            })
        );
        const handler = await burger.fetchHandler();
        const statuses: number[] = [];
        for (let i = 0; i < 3; i++) {
            const res = await handler(
                new Request('http://localhost/api', {
                    headers: { 'X-API-Key': 'k-123' },
                })
            );
            statuses.push(res.status);
        }
        expect(statuses.slice(0, 2)).toEqual([200, 200]);
        expect(statuses[2]).toBe(429);
    });

    it('hashKey: full-length deterministic digest, distinct per input', async () => {
        const a = await hashKey('client-a');
        const b = await hashKey('client-b');
        const a2 = await hashKey('client-a');
        expect(a).toHaveLength(64);
        expect(a2).toBe(a);
        expect(a).not.toBe(b);
    });
});