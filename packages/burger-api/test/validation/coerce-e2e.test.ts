import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import {
    compileRouteSchema,
    validatorCache,
    clearValidatorCache,
} from '../../src/validation/compiler';
import { createValidatorMiddleware } from '../../src/validation/validator';
import type { BurgerRequest } from '../../src/types/index';

/** Builds a minimal BurgerRequest-like object for the orchestrator. */
function fakeReq(
    method: string,
    query: Record<string, string> = {},
    params: Record<string, string> = {}
): BurgerRequest {
    const headers = new Headers();
    return {
        method,
        params,
        query,
        headers,
        validated: undefined,
        json: async () => ({}),
    } as unknown as BurgerRequest;
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

    it('leaves values as strings when coercion is OFF (default)', async () => {
        const schema = {
            get: { query: z.object({ n: z.number() }) },
        };
        const validators = compileRouteSchema(schema, { coerce: false });
        const middleware = createValidatorMiddleware(validators);
        const req = fakeReq('get', { n: '42' });
        const next = await middleware(req);
        // Without coercion, "42" is not a number => 400 error response.
        expect(next).toBeInstanceOf(Response);
        if (next instanceof Response) {
            expect(next.status).toBe(400);
        }
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
