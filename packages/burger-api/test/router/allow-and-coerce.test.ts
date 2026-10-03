import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';

describe('405 Allow header', () => {
    it('includes HEAD when GET exists, and OPTIONS', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/get',
                handlers: { GET: () => new Response('ok') },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(
            new Request('http://t/get', { method: 'POST' })
        );
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    });

    it('does not add HEAD without GET, still adds OPTIONS', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/post',
                handlers: { POST: () => new Response('ok') },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(
            new Request('http://t/post', { method: 'GET' })
        );
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('POST, OPTIONS');
    });

    it('is never empty', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/headonly',
                handlers: { HEAD: () => new Response(null) },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(
            new Request('http://t/headonly', { method: 'POST' })
        );
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('HEAD, OPTIONS');
    });
});

describe('top-level coerce in schema.ts', () => {
    it('enables coercion for every method', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/coerced',
                schema: {
                    coerce: true,
                    get: { query: z.object({ n: z.number() }) },
                } as never,
                handlers: {
                    GET: (ctx: any) =>
                        Response.json({
                            n: ctx.validated?.query?.n ?? null,
                        }),
                },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(
            new Request('http://t/coerced?n=42')
        );
        const body = (await res.json()) as { n: unknown };
        expect(body.n).toBe(42);
    });

    it('still coerces when a per-method coerce is set', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/coerced2',
                schema: {
                    get: { query: z.object({ n: z.number() }), coerce: true },
                } as never,
                handlers: {
                    GET: (ctx: any) =>
                        Response.json({
                            n: ctx.validated?.query?.n ?? null,
                        }),
                },
            } as never,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(
            new Request('http://t/coerced2?n=7')
        );
        const body = (await res.json()) as { n: unknown };
        expect(body.n).toBe(7);
    });
});
