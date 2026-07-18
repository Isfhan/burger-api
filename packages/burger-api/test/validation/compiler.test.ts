import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import { compileRouteSchema, validatorCache, clearValidatorCache } from '../../src/validation/compiler';
import type { CompiledRouteValidators } from '../../src/validation/types';

describe('compileRouteSchema (M2)', () => {
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
        const a = compileRouteSchema({ get: { query: z.object({ x: z.string() }) } });
        const b = compileRouteSchema({ get: { query: z.object({ y: z.string() }) } });
        expect(a.methods.get?.query).not.toBe(b.methods.get?.query);
        expect(validatorCache.size).toBeGreaterThanOrEqual(2);
    });

    it('validates input via the compiled validator (no raw schema walk at request path)', () => {
        const v = compileRouteSchema({ get: { query: querySchema } });
        const cv = v.methods.get!.query!;
        expect(cv.validate({ search: 'hi' }).success).toBe(true);
        expect(cv.validate({}).success).toBe(false);
    });
});
