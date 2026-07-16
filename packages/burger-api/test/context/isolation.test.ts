import { describe, it, expect } from 'bun:test';
import { Router } from '../../src/router/router';
import { z } from 'zod';
import type { RouteDefinition } from '../../src/types/index';

/**
 * Concurrency / isolation (ROADMAP-phase2 §15.4). Fires 100 concurrent
 * requests that read `req.params`, `req.query`, `req.set`, and `req.validated`,
 * and asserts each request sees ONLY its own data — no cross-request leakage,
 * because every request gets its own `BurgerContext` instance.
 */
describe('BurgerContext isolation (100 concurrent requests)', () => {
    function makeRouter(): Router {
        const defs: RouteDefinition[] = [
            {
                path: '/iso/:id',
                handlers: {
                    GET: (req: any) => {
                        req.set.headers = { 'x-reqid': String(req.query.reqid) };
                        return Response.json({
                            id: req.params.id,
                            query: req.query.reqid,
                        });
                    },
                },
            } as any,
            {
                path: '/v',
                handlers: {
                    GET: (req: any) =>
                        Response.json({ vq: req.validated.query.q }),
                },
                schema: { get: { query: z.object({ q: z.string() }) } },
            } as any,
        ];
        const router = new Router({});
        router.compile(defs);
        return router;
    }

    it('isolates params / query / req.set / validated across concurrent requests', async () => {
        const router = makeRouter();
        const N = 100;

        const direct = await Promise.all(
            Array.from({ length: N }, async (_, i) => {
                const id = `id-${i}`;
                const reqid = `req-${i}`;
                const res = await router.fetch(
                    new Request(`http://h/iso/${id}?reqid=${reqid}`)
                );
                const body = await res.json();
                return { id, reqid, body, header: res.headers.get('x-reqid') };
            })
        );

        for (const r of direct) {
            expect(r.body.id).toBe(r.id);
            expect(r.body.query).toBe(r.reqid);
            expect(r.header).toBe(r.reqid);
        }

        const validated = await Promise.all(
            Array.from({ length: N }, async (_, i) => {
                const res = await router.fetch(
                    new Request(`http://h/v?q=val-${i}`)
                );
                return (await res.json()).vq;
            })
        );

        for (let i = 0; i < N; i++) {
            expect(validated[i]).toBe(`val-${i}`);
        }
    });
});
