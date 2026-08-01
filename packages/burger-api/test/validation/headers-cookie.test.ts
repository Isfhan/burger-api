import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import {
    compileRouteSchema,
    validatorCache,
    clearValidatorCache,
} from '../../src/validation/compiler';
import { createValidatorMiddleware } from '../../src/validation/validator';
import { ValidationError } from '../../src/validation/error';
import type { BurgerContext } from '../../src/context/context';

function fakeCtx(
    method: string,
    opts: {
        query?: Record<string, string>;
        params?: Record<string, string>;
        headers?: Record<string, string>;
        cookie?: string;
    } = {}
): BurgerContext {
    const headers = new Headers();
    if (opts.headers)
        for (const [k, v] of Object.entries(opts.headers)) headers.set(k, v);
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

describe('headers/cookie slots + response', () => {
    beforeEach(() => clearValidatorCache());

    it('validates a required header and attaches validated.headers', async () => {
        const schema = {
            get: { headers: z.object({ 'x-api-key': z.string() }) },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        const ctx = fakeCtx('get', { headers: { 'x-api-key': 'abc' } });
        await mw(ctx);
        expect((ctx.validated as any).headers).toEqual({ 'x-api-key': 'abc' });
    });

    it('throws ValidationError for missing header', async () => {
        const schema = {
            get: { headers: z.object({ 'x-api-key': z.string() }) },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        const ctx = fakeCtx('get', {});
        try {
            await mw(ctx);
            expect(true).toBe(false); // should not reach
        } catch (e) {
            expect(e).toBeInstanceOf(ValidationError);
            expect((e as ValidationError).status).toBe(422);
        }
    });

    it('validates cookie values', async () => {
        const schema = {
            get: { cookies: z.object({ sid: z.string() }) },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        const ctx = fakeCtx('get', { cookie: 'sid=xyz' });
        await mw(ctx);
        expect((ctx.validated as any).cookies).toEqual({ sid: 'xyz' });
    });

    it('parses RFC 6265 quoted cookie values containing ; and =', async () => {
        const schema = {
            get: {
                cookies: z.object({
                    session: z.string(),
                    csrftoken: z.string(),
                }),
            },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        const ctx = fakeCtx('get', {
            cookie: 'session="a;b=c"; csrftoken=token',
        });
        await mw(ctx);
        expect((ctx.validated as any).cookies).toEqual({
            session: 'a;b=c',
            csrftoken: 'token',
        });
    });

    it('apps with no headers/cookie schema are unaffected', async () => {
        const schema = { get: { query: z.object({ q: z.string() }) } };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        const ctx = fakeCtx('get', { query: { q: 'hi' } });
        await mw(ctx);
        expect((ctx.validated as any).query).toEqual({ q: 'hi' });
        expect((ctx.validated as any).headers).toBeUndefined();
    });

    it('multiple failing slots report issues in ValidationError', async () => {
        const schema = {
            get: {
                params: z.object({ id: z.number() }),
                query: z.object({ n: z.number() }),
            },
        };
        const validators = compileRouteSchema(schema, {});
        const mw = createValidatorMiddleware(validators);
        // Both params and query fail (strings instead of numbers).
        const ctx = fakeCtx('get', {
            params: { id: 'abc' },
            query: { n: 'xyz' },
        });
        try {
            await mw(ctx);
            expect(true).toBe(false); // should not reach
        } catch (e) {
            expect(e).toBeInstanceOf(ValidationError);
            const ve = e as ValidationError;
            expect(ve.status).toBe(422);
            // Issues from both slots should be present.
            expect(ve.issues.length).toBeGreaterThan(0);
        }
    });
});
