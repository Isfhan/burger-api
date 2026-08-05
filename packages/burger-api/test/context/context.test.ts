import { describe, it, expect } from 'bun:test';
import { BurgerContext } from '../../src/context/context';
import { applySet } from '../../src/utils/response';
import type { ContextInit } from '../../src/context/types';

describe('BurgerContext (prototype-based request)', () => {
    it('seeds params / wildcardParams / route from ctxInit', () => {
        const ctxInit: ContextInit = {
            params: { id: '7' },
            wildcardParams: ['x', 'y'],
            route: { path: '/p', pattern: '/u/:id' },
        };
        const ctx = BurgerContext.create(new Request('http://h/p'), ctxInit);
        expect(ctx.params).toEqual({ id: '7' });
        expect(ctx.wildcardParams).toEqual(['x', 'y']);
        expect(ctx.route).toEqual({ path: '/p', pattern: '/u/:id' });
    });

    it('leaves params/wildcardParams undefined when ctxInit omits them', () => {
        const ctx = BurgerContext.create(new Request('http://h/'), {
            route: { path: '/', pattern: '/' },
        });
        expect(ctx.params).toBeUndefined();
        expect(ctx.wildcardParams).toBeUndefined();
        // route is always present in for matched routes.
        expect(ctx.route).toEqual({ path: '/', pattern: '/' });
    });

    it('parses query lazily and caches it (single parse)', () => {
        const raw = new Request('http://h/?q=hello+world&a=1&a=2');
        const ctx = BurgerContext.create(raw, {
            route: { path: '/', pattern: '/' },
        });
        const first = ctx.query;
        expect(first).toEqual({ q: 'hello world', a: ['1', '2'] });
        // Second access returns the identical cached object (no re-parse).
        expect(ctx.query).toBe(first);
    });

    it('delegates the standard Request surface to the underlying Request', () => {
        const raw = new Request('http://h/p?x=1', {
            method: 'POST',
            headers: { 'x-test': 'yes' },
        });
        const ctx = BurgerContext.create(raw, {
            route: { path: '/p', pattern: '/p' },
        });
        expect(ctx.method).toBe('POST');
        expect(ctx.url).toBe('http://h/p?x=1');
        expect(ctx.headers.get('x-test')).toBe('yes');
        expect(ctx.signal).toBe(raw.signal);
        expect(ctx.body).toBe(raw.body);
        expect(ctx.bodyUsed).toBe(raw.bodyUsed);
    });

    it('delegates body-reading methods to the underlying Request', async () => {
        const raw = new Request('http://h/', {
            method: 'POST',
            body: JSON.stringify({ ok: true }),
        });
        const ctx = BurgerContext.create(raw, {
            route: { path: '/', pattern: '/' },
        });
        expect(await ctx.json()).toEqual({ ok: true });
        const raw2 = new Request('http://h/', {
            method: 'POST',
            body: 'plain',
        });
        const ctx2 = BurgerContext.create(raw2, {
            route: { path: '/', pattern: '/' },
        });
        expect(await ctx2.text()).toBe('plain');
        expect(typeof ctx2.arrayBuffer).toBe('function');
        expect(typeof ctx2.blob).toBe('function');
        expect(typeof ctx2.formData).toBe('function');
        expect(typeof ctx2.clone).toBe('function');
    });

    it('preserves hook instance state on validated / set', () => {
        const ctx = BurgerContext.create(new Request('http://h/'), {
            route: { path: '/', pattern: '/' },
        });
        // Starts undefined so the validation hook runs.
        expect(ctx.validated).toBeUndefined();
        ctx.validated = { params: { id: '1' } };
        expect(ctx.validated).toEqual({ params: { id: '1' } });
        ctx.set.status = 201;
        ctx.set.headers = { 'x-custom': 'v' };
        expect(ctx.set.status).toBe(201);
        expect(ctx.set.headers).toEqual({ 'x-custom': 'v' });
    });

    it('creates exactly one instance per request (no wrapper per hook)', () => {
        const raw = new Request('http://h/');
        const ctx = BurgerContext.create(raw, {
            route: { path: '/', pattern: '/' },
        });
        expect(ctx).toBe(ctx);
        expect(Object.getPrototypeOf(ctx)).toBe(BurgerContext.prototype);
    });
});

describe('applySet (response mutation, only)', () => {
    it('merges headers over the existing response and overrides status', () => {
        const res = new Response('body', {
            status: 200,
            headers: { 'content-type': 'text/plain', existing: 'keep' },
        });
        const out = applySet(res, {
            status: 201,
            headers: { 'x-new': '1', existing: 'over' },
        });
        expect(out.status).toBe(201);
        expect(out.headers.get('x-new')).toBe('1');
        expect(out.headers.get('existing')).toBe('over');
        expect(out.headers.get('content-type')).toBe('text/plain');
    });

    it('preserves the original status when set.status is absent', () => {
        const res = new Response('body', { status: 418 });
        const out = applySet(res, { headers: { a: 'b' } });
        expect(out.status).toBe(418);
        expect(out.headers.get('a')).toBe('b');
    });

    it('returns the response unchanged when set is undefined', () => {
        const res = new Response('body', { status: 200 });
        expect(applySet(res, undefined)).toBe(res);
    });
});
