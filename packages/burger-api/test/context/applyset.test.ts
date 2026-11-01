import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { applySet, hasSetMutations } from '../../src/utils/response';
import {
    SET_HEADERS,
    SET_STATUS,
    TrackedContextSet,
} from '../../src/context/context-set';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';

describe('applySet no-op behavior', () => {
    it('returns the original Response when set is empty (no rebuild)', () => {
        const res = new Response('body', {
            status: 200,
            headers: { 'content-type': 'text/plain' },
        });
        const out = applySet(res, {});
        // Zero work: same object, no new Response / Headers allocation.
        expect(out).toBe(res);
    });

    it('returns the original Response when set is undefined', () => {
        const res = new Response('body', { status: 200 });
        expect(applySet(res, undefined)).toBe(res);
    });

    it('hasSetMutations reports correctly', () => {
        expect(hasSetMutations(undefined)).toBe(false);
        expect(hasSetMutations({})).toBe(false);
        expect(hasSetMutations({ status: 204 })).toBe(true);
        expect(hasSetMutations({ headers: { a: 'b' } })).toBe(true);
        expect(hasSetMutations({ headers: new Headers({ a: 'b' }) })).toBe(
            true
        );
        // Empty headers object → no mutation.
        expect(hasSetMutations({ headers: {} })).toBe(false);
    });
});

describe('applySet on auto-HEAD (uniform mutation)', () => {
    it('preserves status + headers from req.set', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/items/:id',
                handlers: {
                    GET: (req: any) => {
                        req.set.status = 202;
                        req.set.headers = { 'x-tag': 'head' };
                        return Response.json({ id: req.params.id });
                    },
                },
            } as any,
        ];
        const router = new Router({});
        router.compile(defs);

        // No explicit HEAD handler → auto-HEAD derived from GET.
        const res = await router.fetch(
            new Request('http://h/items/7', { method: 'HEAD' })
        );

        expect(res.status).toBe(202);
        expect(res.headers.get('x-tag')).toBe('head');
    });
});

describe('auto-HEAD response validation', () => {
    it('validates the GET-derived response for HEAD when a response schema exists', async () => {
        const config = {
            validation: { responseValidation: 'enforce' as const },
        };
        const defs: RouteDefinition[] = [
            {
                path: '/items/:id',
                schema: {
                    get: {
                        response: {
                            200: z.object({ id: z.string() }),
                        },
                    },
                } as any,
                handlers: {
                    GET: (req: any) => Response.json({ id: req.params.id }),
                },
            } as any,
        ];
        const router = new Router(config);
        router.compile(defs);

        // Matching response -> 200 HEAD (the server drops the body).
        const ok = await router.fetch(
            new Request('http://h/items/7', { method: 'HEAD' })
        );
        expect(ok.status).toBe(200);
    });
});

describe('tracked ContextSet fast paths', () => {
    it('tracks flags per assignment', () => {
        const set = new TrackedContextSet();
        expect(set.flags).toBe(0);
        set.status = 201;
        expect(set.flags).toBe(SET_STATUS);
        set.headers = { a: 'b' };
        expect(set.flags).toBe(SET_STATUS | SET_HEADERS);
    });

    it('status-only applies without touching the header list contents', () => {
        const res = new Response('body', {
            status: 200,
            headers: { 'content-type': 'text/plain', 'x-keep': '1' },
        });
        const set = new TrackedContextSet();
        set.status = 202;
        const out = applySet(res, set);
        expect(out).not.toBe(res);
        expect(out.status).toBe(202);
        expect(out.headers.get('content-type')).toBe('text/plain');
        expect(out.headers.get('x-keep')).toBe('1');
    });

    it('an untouched tracked set returns the original response', () => {
        const res = new Response('body');
        const set = new TrackedContextSet();
        expect(applySet(res, set)).toBe(res);
        expect(hasSetMutations(set)).toBe(false);
    });

    it('headers (with or without status) still merge over the response', () => {
        const res = new Response('body', {
            status: 200,
            headers: { 'x-base': '1' },
        });
        const headersOnly = new TrackedContextSet();
        headersOnly.headers = { 'x-added': '2' };
        const out = applySet(res, headersOnly);
        expect(out.status).toBe(200);
        expect(out.headers.get('x-base')).toBe('1');
        expect(out.headers.get('x-added')).toBe('2');

        const res2 = new Response('body', {
            status: 200,
            headers: { 'x-base': '1' },
        });
        const both = new TrackedContextSet();
        both.status = 418;
        both.headers = new Headers({ 'x-added': '3' });
        const out2 = applySet(res2, both);
        expect(out2.status).toBe(418);
        expect(out2.headers.get('x-added')).toBe('3');
    });

    it('a plain object set keeps the legacy scan behavior', () => {
        const res = new Response('body');
        expect(applySet(res, {})).toBe(res);
        expect(applySet(res, { status: 204 }).status).toBe(204);
    });
});

describe('lazy ctx.set allocation', () => {
    it('does not allocate until first access; hasSet() flips on write', async () => {
        let observed: { hasSet: boolean } | undefined;
        const defs: RouteDefinition[] = [
            {
                path: '/lazy',
                handlers: {
                    GET: (ctx) => {
                        // Simulate the pipeline exit probe BEFORE any touch.
                        const before = ctx.hasSet();
                        ctx.set.status = 201; // first touch allocates
                        return Response.json({
                            before,
                            after: ctx.hasSet(),
                        });
                    },
                },
            },
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(new Request('http://t/lazy'));
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(201); // set.status applied at exit
        expect(body.before).toBe(false);
        expect(body.after).toBe(true);
        void observed;
    });

    it('untouched requests skip applySet entirely (identity preserved)', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/clean',
                handlers: { GET: () => new Response('ok', { status: 200 }) },
            },
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(new Request('http://t/clean'));
        expect(res.status).toBe(200);
    });
});
