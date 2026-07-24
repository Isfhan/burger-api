import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import {
    compileRouteSchema,
    validatorCache,
    clearValidatorCache,
} from '../../src/validation/compiler';
import { createValidatorMiddleware } from '../../src/validation/validator';
import type { BurgerContext } from '../../src/context/context';

function fakeReq(
    method: string,
    opts: {
        query?: Record<string, string>;
        params?: Record<string, string>;
        headers?: Record<string, string>;
        cookie?: string;
    } = {}
): BurgerContext {
    const headers = new Headers();
    if (opts.headers) for (const [k, v] of Object.entries(opts.headers)) headers.set(k, v);
    if (opts.cookie) headers.set('cookie', opts.cookie);
    return {
        method,
        params: opts.params ?? {},
        query: opts.query ?? {},
        headers,
        validated: undefined,
        json: async () => ({}),
    } as unknown as BurgerContext;
}

describe('headers/cookie slots + response (M5)', () => {
    beforeEach(() => clearValidatorCache());

    it('validates a required header and attaches validated.headers', async () => {
        const schema = {
            get: { headers: z.object({ 'x-api-key': z.string() }) },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        const req = fakeReq('get', { headers: { 'x-api-key': 'abc' } });
        await mw(req);
        expect((req.validated as any).headers).toEqual({ 'x-api-key': 'abc' });
    });

    it('rejects missing header with 400', async () => {
        const schema = {
            get: { headers: z.object({ 'x-api-key': z.string() }) },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        const req = fakeReq('get', {});
        const next = await mw(req);
        expect(next).toBeInstanceOf(Response);
        if (next instanceof Response) expect(next.status).toBe(400);
    });

    it('validates cookie values', async () => {
        const schema = {
            get: { cookie: z.object({ sid: z.string() }) },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        const req = fakeReq('get', { cookie: 'sid=xyz' });
        await mw(req);
        expect((req.validated as any).cookie).toEqual({ sid: 'xyz' });
    });

    it('parses RFC 6265 quoted cookie values containing ; and =', async () => {
        const schema = {
            // Both keys are declared so Zod retains them (default .object() strips
            // unknown keys). This verifies the quoted value is parsed correctly
            // AND the second cookie pair is preserved.
            get: { cookie: z.object({ session: z.string(), csrftoken: z.string() }) },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        // Quoted value contains ';' and '=' which must not split the pair.
        const req = fakeReq('get', { cookie: 'session="a;b=c"; csrftoken=token' });
        await mw(req);
        expect((req.validated as any).cookie).toEqual({
            session: 'a;b=c',
            csrftoken: 'token',
        });
    });

    it('apps with no headers/cookie schema are unaffected', async () => {
        const schema = { get: { query: z.object({ q: z.string() }) } };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        const req = fakeReq('get', { query: { q: 'hi' } });
        await mw(req);
        expect((req.validated as any).query).toEqual({ q: 'hi' });
        expect((req.validated as any).headers).toBeUndefined();
    });

    it('multiple failing slots report each under its own key', async () => {
        const schema = {
            get: {
                params: z.object({ id: z.number() }),
                query: z.object({ n: z.number() }),
            },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        // Both params and query fail (strings instead of numbers).
        const req = fakeReq('get', {
            params: { id: 'abc' },
            query: { n: 'xyz' },
        });
        const next = await mw(req);
        expect(next).toBeInstanceOf(Response);
        if (next instanceof Response) {
            expect(next.status).toBe(400);
            const body = await next.json();
            expect(body.errors.params).toBeDefined();
            expect(body.errors.query).toBeDefined();
            // Issues must not be collapsed under a single slot key.
            expect(Object.keys(body.errors)).toEqual(['params', 'query']);
        }
    });
});
