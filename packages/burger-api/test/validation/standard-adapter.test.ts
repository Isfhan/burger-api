import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { StandardAdapter } from '../../src/validation/adapters/standard';
import type {
    StandardSchemaV1,
    ValidationResult,
} from '../../src/validation/types';

/** A hand-built `~standard` stub (no Valibot dependency needed). */
function makeStub(
    ok: boolean,
    opts?: { coercible?: boolean }
): StandardSchemaV1 {
    return {
        '~standard': {
            version: 1,
            vendor: 'stub',
            coercible: opts?.coercible,
            validate: (value: unknown) => {
                if (ok && typeof value === 'object' && value !== null) {
                    return { value };
                }
                return {
                    value,
                    issues: [{ message: 'stub failed', path: ['field'] }],
                };
            },
        },
    };
}

describe('StandardAdapter', () => {
    it('detects and supports a ~standard schema', () => {
        const stub = makeStub(true);
        expect(StandardAdapter.supports(stub)).toBe(true);
    });

    it('does not support a plain object without ~standard', () => {
        expect(StandardAdapter.supports({} as any)).toBe(false);
    });

    it('compiles and validates a passing ~standard schema', () => {
        const cv = StandardAdapter.compile(makeStub(true), 'query');
        expect(cv.kind).toBe('standard');
        const r = cv.validate({ field: 1 }) as ValidationResult;
        expect(r.success).toBe(true);
    });

    it('normalizes issues into ValidationIssue[]', () => {
        const cv = StandardAdapter.compile(makeStub(false), 'query');
        const r = cv.validate({}) as ValidationResult;
        expect(r.success).toBe(false);
        if (!r.success) {
            expect(r.issues[0]!.path).toEqual(['field']);
            expect(r.issues[0]!.message).toBe('stub failed');
        }
    });

    it('produces a stable identity', () => {
        const a = makeStub(true);
        expect(StandardAdapter.identity(a)).toBe(StandardAdapter.identity(a));
        expect(StandardAdapter.identity(a)).toMatch(/^standard:stub:/);
    });

    it('reports coercible from the ~standard.coercible flag', () => {
        expect(StandardAdapter.compile(makeStub(true), 'query').coercible)
            .toBe(false);
        expect(
            StandardAdapter.compile(
                makeStub(true, { coercible: true }),
                'query'
            ).coercible
        ).toBe(true);
    });

    it('is not cacheable — distinct schemas must never share a cached validator', () => {
        // Vendors like valibot fingerprint every schema identically
        // (`~standard.types` serializes to "[object Object]"), so a cache
        // keyed on identity would validate one slot with another schema's
        // validator (silently stripping fields). The adapter must opt out.
        const a = makeStub(true);
        const b = makeStub(true);
        expect(StandardAdapter.identity(a)).toBe(StandardAdapter.identity(b));
        expect(StandardAdapter.cacheable?.(a)).toBe(false);
    });
});
