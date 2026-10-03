import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import {
    compileRouteSchema,
    validatorCache,
    clearValidatorCache,
} from '../../src/validation/compiler';
import type { CompiledRouteValidators } from '../../src/validation/types';

describe('compileRouteSchema', () => {
    const querySchema = z.object({ search: z.string() });
    const bodySchema = z.object({ name: z.string() });

    beforeEach(() => clearValidatorCache());

    it('produces CompiledRouteValidators for a route with params/query/body', () => {
        const schema = {
            get: { query: querySchema },
            post: { body: bodySchema },
        };
        const v: CompiledRouteValidators = compileRouteSchema(schema);
        expect(v.methods.get?.query).toBeDefined();
        expect(v.methods.post?.body).toBeDefined();
        expect(v.methods.get?.body).toBeUndefined();
    });

    it('shares one compiled validator across routes with the same inline schema reference', () => {
        const shared = z.object({ id: z.string() });
        const a = compileRouteSchema({ get: { query: shared } });
        const b = compileRouteSchema({ post: { query: shared } });
        // Same identity => same cached CompiledValidator instance.
        expect(a.methods.get?.query).toBe(b.methods.post?.query);
    });

    it('cache is keyed by identity: distinct schemas get distinct validators', () => {
        const a = compileRouteSchema({
            get: { query: z.object({ x: z.string() }) },
        });
        const b = compileRouteSchema({
            get: { query: z.object({ y: z.string() }) },
        });
        expect(a.methods.get?.query).not.toBe(b.methods.get?.query);
        expect(validatorCache.size).toBeGreaterThanOrEqual(2);
    });

    it('validates input via the compiled validator (no raw schema walk at request path)', () => {
        const v = compileRouteSchema({ get: { query: querySchema } });
        const cv = v.methods.get!.query!;
        expect(cv.validate({ search: 'hi' }).success).toBe(true);
        expect(cv.validate({}).success).toBe(false);
    });

    it('fails at startup for a response key that is not a status code or class', () => {
        expect(() =>
            compileRouteSchema(
                { get: { response: { good: z.string() } } } as never,
                {},
                undefined,
                '/api/status'
            )
        ).toThrow(
            'Invalid response schema key "good" for GET /api/status'
        );
    });

    it('fails at startup for an uppercase status class key', () => {
        expect(() =>
            compileRouteSchema(
                { post: { response: { '2XX': z.string() } } } as never,
                {},
                undefined,
                '/api/status'
            )
        ).toThrow('Invalid response schema key "2XX" for POST /api/status');
    });

    it('accepts exact status codes and lowercase status classes', () => {
        const v = compileRouteSchema(
            {
                get: {
                    response: {
                        200: z.string(),
                        '201': z.string(),
                        '2xx': z.string(),
                        '4xx': z.string(),
                    },
                },
            } as never
        );
        expect(v.response?.get?.['200']).toBeDefined();
        expect(v.response?.get?.['201']).toBeDefined();
        expect(v.response?.get?.['2xx']).toBeDefined();
        expect(v.response?.get?.['4xx']).toBeDefined();
    });

    it('fails at startup for an uppercase header schema key', () => {
        expect(() =>
            compileRouteSchema(
                {
                    get: {
                        headers: z.object({ 'X-Api-Key': z.string() }),
                    },
                } as never,
                {},
                undefined,
                '/api/secure'
            )
        ).toThrow(
            'Header schema key "X-Api-Key" for GET /api/secure can never match: header names are lowercased at runtime. Use "x-api-key" instead.'
        );
    });

    it('accepts lowercase header schema keys', () => {
        const v = compileRouteSchema({
            get: { headers: z.object({ 'x-api-key': z.string() }) },
        } as never);
        expect(v.methods.get?.headers).toBeDefined();
    });

    it('skips the header key check when the schema exposes no shape', () => {
        const v = compileRouteSchema({
            get: { headers: z.record(z.string(), z.string()) },
        } as never);
        expect(v.methods.get?.headers).toBeDefined();
    });

    it('checks a Standard Schema that exposes a shape', () => {
        const standard = {
            '~standard': {
                version: 1,
                vendor: 'test',
                validate: (value: unknown) => ({ value }),
            },
            shape: { 'X-Token': {} },
        };
        expect(() =>
            compileRouteSchema(
                { get: { headers: standard } } as never,
                {},
                undefined,
                '/api/secure'
            )
        ).toThrow('Header schema key "X-Token" for GET /api/secure');
    });

    it('never shares a compiled validator between unrepresentable schemas', () => {
        const upper = z.string().transform((s) => s.toUpperCase());
        const length = z.string().transform((s) => s.length);
        const a = compileRouteSchema({ post: { body: upper } });
        const b = compileRouteSchema({ post: { body: length } });
        const va = a.methods.post!.body!;
        const vb = b.methods.post!.body!;
        expect(va).not.toBe(vb);
        expect(va.validate('abc')).toEqual({ success: true, data: 'ABC' });
        expect(vb.validate('abc')).toEqual({ success: true, data: 3 });
    });
});
