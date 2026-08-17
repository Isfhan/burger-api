/**
 * Validator cache identity: refinements and coercions must never bleed
 * between routes, regardless of registration order.
 */
import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { Burger } from '../../src/index';

async function post(
    burger: Burger,
    path: string,
    body: string
): Promise<Response> {
    const handler = await burger.fetchHandler();
    return handler(
        new Request(`http://localhost${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        })
    );
}

function makeBurger(routes: { path: string; schema: unknown }[]): Burger {
    return new Burger({
        apiRoutes: routes.map((r) => ({
            path: r.path,
            handlers: { POST: () => Response.json({ ok: true }) },
            schema: r.schema as never,
            openapi: {},
        })),
    });
}

describe('validator cache identity', () => {
    it('a refined schema keeps its refinement when a plain schema was cached first', async () => {
        const burger = makeBurger([
            { path: '/api/plain', schema: { post: { body: z.string() } } },
            {
                path: '/api/refined',
                schema: { post: { body: z.string().refine((s) => s === 'secret') } },
            },
        ]);
        expect((await post(burger, '/api/plain', '"anything"')).status).toBe(200);
        expect((await post(burger, '/api/refined', '"secret"')).status).toBe(200);
        expect((await post(burger, '/api/refined', '"other"')).status).toBe(422);
    });

    it('the same behavior holds when the refined route registers first', async () => {
        const burger = makeBurger([
            {
                path: '/api/refined',
                schema: { post: { body: z.string().refine((s) => s === 'secret') } },
            },
            { path: '/api/plain', schema: { post: { body: z.string() } } },
        ]);
        expect((await post(burger, '/api/refined', '"secret"')).status).toBe(200);
        expect((await post(burger, '/api/refined', '"other"')).status).toBe(422);
        expect((await post(burger, '/api/plain', '"anything"')).status).toBe(200);
    });

    it('z.coerce.number() never leaks coercion onto z.number()', async () => {
        const burger = makeBurger([
            { path: '/api/coerce', schema: { post: { body: z.coerce.number() } } },
            { path: '/api/plain', schema: { post: { body: z.number() } } },
        ]);
        // Coercing route accepts a JSON string.
        expect((await post(burger, '/api/coerce', '"5"')).status).toBe(200);
        // Plain route must still reject it — its validator must not be the
        // cached coercing one.
        expect((await post(burger, '/api/plain', '"5"')).status).toBe(422);
    });

    it('z.number() never blocks z.coerce.number() when registered first', async () => {
        const burger = makeBurger([
            { path: '/api/plain', schema: { post: { body: z.number() } } },
            { path: '/api/coerce', schema: { post: { body: z.coerce.number() } } },
        ]);
        expect((await post(burger, '/api/plain', '"5"')).status).toBe(422);
        expect((await post(burger, '/api/coerce', '"5"')).status).toBe(200);
    });
});