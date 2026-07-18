import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { ZodAdapter } from '../../src/validation/adapters/zod';
import type { ValidationResult } from '../../src/validation/types';

describe('ZodAdapter (M1)', () => {
    const schema = z.object({ id: z.string(), n: z.number() });

    it('produces a stable identity for the same schema reference', () => {
        expect(ZodAdapter.identity(schema)).toBe(ZodAdapter.identity(schema));
        expect(ZodAdapter.identity(schema)).toMatch(/^zod:/);
    });

    it('compiles into a CompiledValidator with a working validate', () => {
        const cv = ZodAdapter.compile(schema, 'query');
        expect(cv.kind).toBe('zod');
        expect(cv.slot).toBe('query');
        expect(cv.identity).toBe(ZodAdapter.identity(schema));
        expect(typeof cv.validate).toBe('function');
    });

    it('validate returns success:true for valid input', () => {
        const cv = ZodAdapter.compile(schema, 'query');
        const result = cv.validate({ id: 'a', n: 1 }) as ValidationResult;
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ id: 'a', n: 1 });
        }
    });

    it('validate returns success:false with normalized issues for invalid input', () => {
        const cv = ZodAdapter.compile(schema, 'query');
        const result = cv.validate({ id: 'a', n: 'not-a-number' }) as ValidationResult;
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(Array.isArray(result.issues)).toBe(true);
            expect(result.issues.length).toBeGreaterThan(0);
            const issue = result.issues[0];
            expect(Array.isArray(issue.path)).toBe(true);
            expect(typeof issue.message).toBe('string');
            // issue carries a Zod code (normalized, not leaking internals)
            expect(issue.code).toBeDefined();
        }
    });

    it('normalizeIssues maps Zod path segments to (string|number)[]', () => {
        const nested = z.object({ outer: z.object({ inner: z.string() }) });
        const cv = ZodAdapter.compile(nested, 'body');
        const result = cv.validate({ outer: { inner: 42 } }) as ValidationResult;
        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.issues[0];
            expect(issue.path).toEqual(['outer', 'inner']);
        }
    });
});
