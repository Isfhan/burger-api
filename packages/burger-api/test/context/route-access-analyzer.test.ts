import { describe, it, expect } from 'bun:test';
import { analyzeRouteAccess } from '../../src/analysis/route-access-analyzer';
import { freezeRouteAccessInfo } from '../../src/context/route-access';
import type { RouteDefinition } from '../../src/types/index';

describe('RouteAccessAnalyzer (optional, compile-time only)', () => {
    it('detects fields referenced in handler source', () => {
        const def = {
            path: '/x',
            handlers: {
                GET: (req: any) => {
                    void req.query;
                    void req.params;
                    return new Response('ok');
                },
            },
        } as unknown as RouteDefinition;
        const info = analyzeRouteAccess(def);
        expect(info.has('query')).toBe(true);
        expect(info.has('params')).toBe(true);
        expect(info.has('route')).toBe(false);
    });

    it('scans route hook source in addition to handlers', () => {
        const mw = (req: any) => {
            void req.headers;
            return undefined;
        };
        const def = {
            path: '/x',
            handlers: { GET: (req: any) => void req.route },
            hooks: { beforeRoute: [mw] },
        } as unknown as RouteDefinition;
        const info = analyzeRouteAccess(def);
        expect(info.has('headers')).toBe(true);
        expect(info.has('route')).toBe(true);
    });

    it('returns the safe "all fields used" default (unknown: true) when debug is true', () => {
        const def = {
            path: '/x',
            handlers: { GET: (req: any) => void req.query },
        } as unknown as RouteDefinition;
        const info = analyzeRouteAccess(def, true);
        expect(info.unknown).toBe(true);
        // unknown ⇒ every field is treated as used.
        expect(info.has('query')).toBe(true);
        expect(info.has('params')).toBe(true);
    });

    it('treats aliased request access as ambiguous (unknown: true)', () => {
        const def = {
            path: '/x',
            handlers: {
                GET: (req: any) => {
                    const r = req;
                    return Response.json({ q: r.query });
                },
            },
        } as unknown as RouteDefinition;
        const info = analyzeRouteAccess(def);
        expect(info.unknown).toBe(true);
        expect(info.has('query')).toBe(true);
    });

    it('produces a frozen, safe-default object on parse failure', () => {
        // freezeRouteAccessInfo with no fields → has() is false for every field,
        // so a failed analysis can never disable a field the route actually uses.
        const info = freezeRouteAccessInfo([]);
        expect(Object.isFrozen(info)).toBe(true);
        expect(info.has('query')).toBe(false);
        expect(info.has('params')).toBe(false);
    });

    // hook stage detection
    it('detects which hook stages a route uses', () => {
        const def = {
            path: '/x',
            handlers: { GET: (req: any) => new Response('ok') },
            hooks: {
                beforeRoute: [(req: any) => undefined],
                onError: [(err: any, req: any) => undefined],
            },
        } as unknown as RouteDefinition;
        const info = analyzeRouteAccess(def);
        expect(info.hooks.has('beforeRoute')).toBe(true);
        expect(info.hooks.has('onError')).toBe(true);
        expect(info.hooks.has('afterRoute')).toBe(false);
        expect(info.hooks.has('mapResponse')).toBe(false);
    });

    it('reports empty hooks when route has no hooks', () => {
        const def = {
            path: '/x',
            handlers: { GET: (req: any) => new Response('ok') },
        } as unknown as RouteDefinition;
        const info = analyzeRouteAccess(def);
        expect(info.hooks.size).toBe(0);
    });

    it('includes hooks even when debug mode treats fields as unknown', () => {
        const def = {
            path: '/x',
            handlers: { GET: (req: any) => new Response('ok') },
            hooks: { afterRoute: [(req: any) => undefined] },
        } as unknown as RouteDefinition;
        const info = analyzeRouteAccess(def, true);
        expect(info.hooks.has('afterRoute')).toBe(true);
    });

    // Only provably-safe access may produce unknown === false.

    it('marks the route unknown when the context escapes to a helper', () => {
        const readId = (ctx: any) => ctx.params.id;
        const def = {
            path: '/x',
            handlers: { GET: (ctx: any) => Response.json({ id: readId(ctx) }) },
        } as unknown as RouteDefinition;
        expect(analyzeRouteAccess(def).unknown).toBe(true);
    });

    it('marks the route unknown when the context parameter is destructured', () => {
        const def = {
            path: '/x',
            handlers: {
                GET: ({ query }: any) => Response.json({ q: query }),
            },
        } as unknown as RouteDefinition;
        expect(analyzeRouteAccess(def).unknown).toBe(true);
    });

    it('marks the route unknown on computed member access', () => {
        const def = {
            path: '/x',
            handlers: {
                // The key arrives at runtime, so the source always carries a
                // computed access (`ctx[key]`).
                GET: (ctx: any, key: string) => Response.json(ctx[key]),
            },
        } as unknown as RouteDefinition;
        expect(analyzeRouteAccess(def).unknown).toBe(true);
    });

    it('marks native functions unknown', () => {
        const def = {
            path: '/x',
            handlers: { GET: Response.json.bind(Response) },
        } as unknown as RouteDefinition;
        expect(analyzeRouteAccess(def).unknown).toBe(true);
    });

    it('accepts direct / optional / quoted-literal member reads as known', () => {
        const def = {
            path: '/x',
            handlers: {
                GET: (ctx: any) => {
                    void ctx.query;
                    void ctx?.params;
                    void ctx['route'];
                    return new Response('ok');
                },
            },
        } as unknown as RouteDefinition;
        const info = analyzeRouteAccess(def);
        expect(info.unknown).toBe(false);
        expect(info.has('query')).toBe(true);
        expect(info.has('params')).toBe(true);
        expect(info.has('route')).toBe(true);
    });

    it('scans extra sources (plugin hooks / transform factories)', () => {
        const def = {
            path: '/x',
            handlers: { GET: () => new Response('ok') },
        } as unknown as RouteDefinition;
        const pluginHook = (ctx: any) => {
            void ctx.headers;
        };
        const info = analyzeRouteAccess(def, false, [
            pluginHook,
            { derived: (ctx: any) => ctx.params },
        ]);
        expect(info.unknown).toBe(false);
        expect(info.has('headers')).toBe(true);
        expect(info.has('params')).toBe(true);
    });

    it('marks unknown when an extra source lets the context escape', () => {
        const def = {
            path: '/x',
            handlers: { GET: () => new Response('ok') },
        } as unknown as RouteDefinition;
        const pluginHook = (ctx: any) => ctx.query;
        const helper = (c: any) => c;
        const escape = (ctx: any) => helper(ctx);
        const info = analyzeRouteAccess(def, false, [pluginHook, escape]);
        expect(info.unknown).toBe(true);
    });
});
