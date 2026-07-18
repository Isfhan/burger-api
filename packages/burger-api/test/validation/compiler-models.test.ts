import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import {
    compileRouteSchema,
    validatorCache,
    clearValidatorCache,
} from '../../src/validation/compiler';
import { SchemaRegistry } from '../../src/validation/registry';
import type { StandardSchemaV1 } from '../../src/validation/types';

function stub(ok: boolean): StandardSchemaV1 {
    return {
        '~standard': {
            version: 1,
            vendor: 'stub',
            validate: (v: unknown) =>
                ok && typeof v === 'object' && v !== null
                    ? { value: v }
                    : { value: v, issues: [{ message: 'bad', path: ['x'] }] },
        },
    };
}

describe('compileRouteSchema with models + Standard Schema (M3)', () => {
    beforeEach(() => clearValidatorCache());

    it('resolves a model ref string into a compiled validator', () => {
        const reg = new SchemaRegistry();
        const Pagination = z.object({ page: z.number() });
        reg.register('Pagination', Pagination);
        const v = compileRouteSchema(
            { get: { query: 'Pagination' } },
            {},
            validatorCache,
            reg
        );
        expect(v.methods.get?.query).toBeDefined();
        expect(v.methods.get!.query!.modelRef).toBe('Pagination');
        const r = v.methods.get!.query!.validate({ page: 1 });
        expect(r.success).toBe(true);
    });

    it('throws on unresolvable model ref, naming method + slot + model', () => {
        const reg = new SchemaRegistry();
        expect(() =>
            compileRouteSchema(
                { get: { query: 'Nope' } },
                {},
                validatorCache,
                reg
            )
        ).toThrow(/Unresolvable model ref "Nope" in schema\.get\.query/);
    });

    it('shares one compiled validator between a model ref and an inline equivalent', () => {
        const reg = new SchemaRegistry();
        const Pagination = z.object({ page: z.number() });
        reg.register('Pagination', Pagination);
        const a = compileRouteSchema(
            { get: { query: 'Pagination' } },
            {},
            validatorCache,
            reg
        );
        const b = compileRouteSchema(
            { get: { query: Pagination } },
            {},
            validatorCache,
            reg
        );
        // Same identity (same JSON Schema fingerprint) => same cached instance.
        expect(a.methods.get?.query?.identity).toBe(
            b.methods.get?.query?.identity
        );
    });

    it('validates Zod and a Standard Schema in the same route set', () => {
        const zodQ = z.object({ a: z.string() });
        const stdQ = stub(true);
        const v = compileRouteSchema({
            get: { query: zodQ },
            post: { query: stdQ },
        });
        expect(v.methods.get?.query?.kind).toBe('zod');
        expect(v.methods.post?.query?.kind).toBe('standard');
        expect(v.methods.get!.query!.validate({ a: 'x' }).success).toBe(true);
        expect(v.methods.post!.query!.validate({ x: 1 }).success).toBe(true);
    });

    it('throws on an unknown (non-Zod, non-Standard) schema', () => {
        expect(() =>
            compileRouteSchema({ get: { query: (123 as any) } })
        ).toThrow(/Unsupported schema/);
    });
});
