import { describe, it, expect } from 'bun:test';
import { BurgerContext } from '../../src/context/context';

/**
 * `parseQuery` runs only inside the lazy `query` getter, the only place
 * `BurgerContext._query` is assigned. If `query` is never read, no parsing
 * happens; the first read caches the result.
 */
describe('Dead-path elimination (lazy query)', () => {
    it('never parses query when req.query is never read', () => {
        const ctx = BurgerContext.create(new Request('http://h/?a=1&b=2'), {
            route: { path: '/', pattern: '/' },
        });
        // Touch other members, but never `req.query`.
        void ctx.method;
        void ctx.url;
        void ctx.headers;
        void ctx.signal;
        void ctx.body;
        void ctx.params;
        void ctx.route;

        // The lazy cache is untouched → the parser never ran.
        expect((ctx as any)._query).toBeUndefined();
    });

    it('parses query exactly once and caches it', () => {
        const ctx = BurgerContext.create(new Request('http://h/?a=1'), {
            route: { path: '/', pattern: '/' },
        });

        expect((ctx as any)._query).toBeUndefined();

        const first = ctx.query;
        expect(first).toEqual({ a: '1' });
        // After the first read, the cache is populated.
        expect((ctx as any)._query).toBe(first);

        // Second read returns the identical cached object (no re-parse).
        const second = ctx.query;
        expect(second).toBe(first);
    });
});
