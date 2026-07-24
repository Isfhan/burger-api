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

/** Builds a minimal BurgerContext-like object for the orchestrator. */
function fakeReq(
    method: string,
    query: Record<string, string> = {},
    params: Record<string, string> = {}
): BurgerContext {
    const headers = new Headers();
    return {
        method,
        params,
        query,
        headers,
        validated: undefined,
        json: async () => ({}),
    } as unknown as BurgerContext;
}

describe('Coercion end-to-end (M4)', () => {
    beforeEach(() => clearValidatorCache());

    it('coerces query string -> number/boolean when enabled', async () => {
        const schema = {
            get: {
                query: z.object({ n: z.number(), b: z.boolean() }),
                coerce: true,
            },
        };
        const validators = compileRouteSchema(schema, { coerce: true });
        const middleware = createValidatorMiddleware(validators);
        const req = fakeReq('get', { n: '42', b: 'true' });
        const next = await middleware(req);
        expect(next).toBeUndefined();
        expect((req.validated as any).query).toEqual({ n: 42, b: true });
    });

    it('throws ValidationError when coercion is OFF (default)', async () => {
        const schema = {
            get: { query: z.object({ n: z.number() }) },
        };
        const validators = compileRouteSchema(schema, { coerce: false });
        const middleware = createValidatorMiddleware(validators);
        const req = fakeReq('get', { n: '42' });
        // Without coercion, "42" is not a number => ValidationError.
        await expect(middleware(req)).rejects.toThrow(ValidationError);
    });

    it('does not build a coercion plan when disabled', () => {
        const schema = {
            get: { query: z.object({ n: z.number() }), coerce: false },
        };
        const validators = compileRouteSchema(schema, { coerce: false });
        expect(validators.methods.get?.coercion).toBeUndefined();
    });

    it('per-route coerce override enables coercion without app-level flag', async () => {
        const schema = {
            get: {
                query: z.object({ n: z.number() }),
                coerce: true,
            },
        };
        const validators = compileRouteSchema(schema, { coerce: false });
        const middleware = createValidatorMiddleware(validators);
        const req = fakeReq('get', { n: '7' });
        await middleware(req);
        expect((req.validated as any).query).toEqual({ n: 7 });
    });
});
