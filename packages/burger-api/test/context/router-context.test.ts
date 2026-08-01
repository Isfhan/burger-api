import { describe, it, expect } from 'bun:test';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';

describe('Router integration: BurgerContext threading', () => {
    function makeRouter(defs: RouteDefinition[]): Router {
        const r = new Router({});
        r.compile(defs);
        return r;
    }

    it('exposes params, route, query, and applies req.set to the response', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/users/:id',
                isWildcard: false,
                handlers: {
                    GET: (req: any) => {
                        req.set.status = 202;
                        req.set.headers = { 'x-saw': String(req.params.id) };
                        return Response.json({
                            id: req.params.id,
                            route: req.route.pattern,
                            q: req.query.q,
                        });
                    },
                },
            } as any,
        ];
        const r = makeRouter(defs);
        const res = await r.fetch(new Request('http://h/users/42?q=hi'));
        expect(res.status).toBe(202);
        expect(res.headers.get('x-saw')).toBe('42');
        const body = await res.json();
        expect(body).toEqual({ id: '42', route: '/users/:id', q: 'hi' });
    });

    it('exposes wildcardParams for wildcard routes', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/files/*',
                isWildcard: true,
                handlers: {
                    GET: (req: any) =>
                        Response.json({ wild: req.wildcardParams }),
                },
            } as any,
        ];
        const r = makeRouter(defs);
        const res = await r.fetch(new Request('http://h/files/a/b/c'));
        expect(await res.json()).toEqual({ wild: ['a', 'b', 'c'] });
    });

    it('runs the validation middleware and populates req.validated', async () => {
        const { z } = await import('zod');
        const defs: RouteDefinition[] = [
            {
                path: '/p/:id',
                isWildcard: false,
                schema: { get: { params: z.object({ id: z.string() }) } },
                handlers: {
                    GET: (req: any) =>
                        Response.json({ id: req.validated.params.id }),
                },
            } as any,
        ];
        const r = makeRouter(defs);
        const res = await r.fetch(new Request('http://h/p/99'));
        expect(await res.json()).toEqual({ id: '99' });
    });

    it('threads ctxInit for a static route (route present, no params)', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/health',
                isWildcard: false,
                handlers: {
                    GET: (req: any) =>
                        Response.json({
                            path: req.route.path,
                            pattern: req.route.pattern,
                            params: req.params,
                        }),
                },
            } as any,
        ];
        const r = makeRouter(defs);
        const res = await r.fetch(new Request('http://h/health'));
        expect(await res.json()).toEqual({
            path: '/health',
            pattern: '/health',
            params: undefined,
        });
    });

    it('retains compiled-route metadata (RouteAccessInfo + RouteMeta)', () => {
        const defs: RouteDefinition[] = [
            {
                path: '/meta/:id',
                isWildcard: false,
                handlers: {
                    GET: (req: any) => {
                        void req.query;
                        return Response.json({ ok: true });
                    },
                },
            } as any,
        ];
        const r = makeRouter(defs);
        const routes = r.getCompiledRoutes();
        expect(routes).toBeDefined();
        const entry = routes!.get('/meta/:id');
        expect(entry).toBeDefined();
        // RouteMeta retained.
        expect(entry!.route).toEqual({
            path: '/meta/:id',
            pattern: '/meta/:id',
        });
        // RouteAccessInfo (frozen hint) retained; runtime never depends on it.
        expect(entry!.meta).toBeDefined();
        expect(entry!.meta!.has('query')).toBe(true);
        expect(Object.isFrozen(entry!.meta!)).toBe(true);
    });
});
