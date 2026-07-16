import { describe, it, expect } from 'bun:test';
import { applySet, hasSetMutations } from '../../src/utils/response';
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
    it('preserves status + headers from req.set while stripping the body', async () => {
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
        // Body must be stripped for HEAD.
        expect(await res.text()).toBe('');
    });
});
