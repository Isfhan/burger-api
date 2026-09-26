/**
 * B3 — the RouteAccessAnalyzer may only specialize work when its verdict is
 * `unknown: false`. These tests cover the conservative fallback: a handler
 * that lets the context escape (helper call, destructuring, computed access)
 * must keep receiving fully extracted params, and `debug: true` disables the
 * specialization entirely.
 */
import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { Router } from '../../src/router/router';
import type { BurgerContext } from '../../src/context/context';
import type { RouteDefinition } from '../../src/types/index';

function nativeGet(router: Router, path: string) {
    const handlers = router.nativeRoutes()[path];
    if (!handlers) throw new Error(`no native route: ${path}`);
    return handlers.GET!;
}

describe('B3 — route-access specialization fallbacks', () => {
    it('keeps params extraction when the context escapes to a helper', async () => {
        const readId = (ctx: BurgerContext) => ctx.params.id;
        const defs = [
            {
                path: '/api/escape/:id',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({ id: readId(ctx) }),
                },
            } as unknown as RouteDefinition,
        ];
        const router = new Router();
        router.compile(defs);

        // The compiled analyzer verdict is unknown for this route.
        expect(
            router.getCompiledRoutes()!.get('/api/escape/:id')!.meta!.unknown
        ).toBe(true);

        // Native dispatch (no ctxInit): everything is derived from the URL.
        const res = await nativeGet(router, '/api/escape/:id')!(
            new Request('http://t/api/escape/7')
        );
        expect(await res.json()).toEqual({ id: '7' });
    });

    it('a params validator still receives extracted params', async () => {
        const defs = [
            {
                path: '/api/v/:id',
                handlers: {
                    // Reads only `validated` — params are consumed by the
                    // framework, not the handler.
                    GET: (ctx: BurgerContext) =>
                        Response.json({
                            id: (
                                ctx.validated as {
                                    params: { id: string };
                                }
                            ).params.id,
                        }),
                },
                schema: { get: { params: z.object({ id: z.string() }) } },
            } as unknown as RouteDefinition,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await nativeGet(router, '/api/v/:id')!(
            new Request('http://t/api/v/42')
        );
        expect(await res.json()).toEqual({ id: '42' });
    });

    it('derives ctx.route lazily even when params are skipped', async () => {
        const defs = [
            {
                path: '/api/r/:id',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({ route: ctx.route }),
                },
            } as unknown as RouteDefinition,
        ];
        const router = new Router();
        router.compile(defs);
        const compiled = router.getCompiledRoutes()!.get('/api/r/:id')!;
        // Known AND params unused → the specialized path is active.
        expect(compiled.meta!.unknown).toBe(false);
        expect(compiled.meta!.has('params')).toBe(false);

        const res = await nativeGet(router, '/api/r/:id')!(
            new Request('http://t/api/r/9')
        );
        expect(await res.json()).toEqual({
            route: { path: '/api/r/9', pattern: '/api/r/:id' },
        });
    });

    it('still builds the empty validated bag when something reads it', async () => {
        const defs = [
            {
                path: '/api/bag',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({ validated: ctx.validated ?? null }),
                },
                // Schema for another method only: GET has no validators.
                schema: { post: { body: z.object({ x: z.string() }) } },
            } as unknown as RouteDefinition,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(new Request('http://t/api/bag'));
        expect(await res.json()).toEqual({ validated: {} });
    });

    it('skips the empty validated bag when nothing reads it', async () => {
        const defs = [
            {
                path: '/api/bag-skip',
                handlers: { GET: () => new Response('ok') },
                schema: { post: { body: z.object({ x: z.string() }) } },
            } as unknown as RouteDefinition,
        ];
        const router = new Router();
        router.compile(defs);
        const compiled = router.getCompiledRoutes()!.get('/api/bag-skip')!;
        expect(compiled.meta!.unknown).toBe(false);
        expect(compiled.meta!.has('validated')).toBe(false);
        expect(
            (await router.fetch(new Request('http://t/api/bag-skip'))).status
        ).toBe(200);
    });

    it('debug: true disables the analyzer (unknown fallback)', () => {
        const defs = [
            {
                path: '/api/dbg',
                handlers: { GET: () => new Response('ok') },
            } as unknown as RouteDefinition,
        ];
        const router = new Router({ debug: true });
        router.compile(defs);
        expect(router.getCompiledRoutes()!.get('/api/dbg')!.meta!.unknown).toBe(
            true
        );
    });
});
