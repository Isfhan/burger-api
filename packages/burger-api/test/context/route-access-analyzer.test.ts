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

    it('scans route middleware source in addition to handlers', () => {
        const mw = (req: any) => {
            void req.headers;
            return undefined;
        };
        const def = {
            path: '/x',
            handlers: { GET: (req: any) => void req.route },
            middleware: [mw],
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
});
