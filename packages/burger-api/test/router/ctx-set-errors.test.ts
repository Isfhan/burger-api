/**
 * `ctx.set` on error responses: headers apply on every path (empty plan,
 * validation-only, full plan); an error status is never overridden.
 */
import { describe, it, expect, spyOn } from 'bun:test';
import { z } from 'zod';
import { Burger, HTTPError } from '../../src/index';
import type { BurgerContext } from '../../src/context/context';

async function fetchVia(
    burger: Burger,
    url: string,
    init?: RequestInit
): Promise<Response> {
    const handler = await burger.fetchHandler();
    return handler(new Request(`http://localhost${url}`, init));
}

describe('ctx.set on error responses', () => {
    it('empty plan: headers apply, error status wins', async () => {
        const errors = spyOn(console, 'error').mockImplementation(() => {});
        try {
            const burger = new Burger({
                debug: false,
                apiRoutes: [
                    {
                        path: '/api/empty',
                        handlers: {
                            GET: (ctx: BurgerContext) => {
                                ctx.set.headers = { 'x-set': 'yes' };
                                ctx.set.status = 201;
                                throw new HTTPError(503, 'down');
                            },
                        },
                    },
                ],
            });
            const res = await fetchVia(burger, '/api/empty');
            expect(res.status).toBe(503);
            expect(res.headers.get('x-set')).toBe('yes');
        } finally {
            errors.mockRestore();
        }
    });

    it('validation-only plan: headers apply, validation status wins', async () => {
        const burger = new Burger({
            debug: false,
            apiRoutes: [
                {
                    path: '/api/validated',
                    handlers: {
                        GET: () => Response.json({ ok: true }),
                    },
                    schema: {
                        get: { query: z.object({ q: z.string() }) },
                    } as never,
                    openapi: {},
                },
            ],
            globalHooks: {
                onRequest: (ctx: BurgerContext) => {
                    ctx.set.headers = { 'x-set': 'yes' };
                    ctx.set.status = 201;
                },
            },
        });
        const res = await fetchVia(burger, '/api/validated');
        expect(res.status).toBe(422);
        expect(res.headers.get('x-set')).toBe('yes');
    });

    it('full plan: headers apply, thrown error status wins', async () => {
        const errors = spyOn(console, 'error').mockImplementation(() => {});
        try {
            const burger = new Burger({
                debug: false,
                apiRoutes: [
                    {
                        path: '/api/hooked',
                        handlers: { GET: () => new Response('ok') },
                        hooks: {
                            beforeRoute: (ctx: BurgerContext) => {
                                ctx.set.headers = { 'x-set': 'yes' };
                                ctx.set.status = 201;
                                throw new HTTPError(503, 'down');
                            },
                        },
                    },
                ],
            });
            const res = await fetchVia(burger, '/api/hooked');
            expect(res.status).toBe(503);
            expect(res.headers.get('x-set')).toBe('yes');
        } finally {
            errors.mockRestore();
        }
    });
});
