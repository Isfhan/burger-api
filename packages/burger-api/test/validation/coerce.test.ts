import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { buildPlan, apply } from '../../src/validation/coerce';

describe('Coercer (M4)', () => {
    const schema = z.object({
        n: z.number(),
        b: z.boolean(),
        d: z.date(),
        s: z.string(),
        opt: z.number().optional(),
    });

    it('buildPlan records only coercible fields', () => {
        const plan = buildPlan(schema, 'query');
        expect(plan).toBeDefined();
        expect(plan!.slot).toBe('query');
        expect(plan!.fields).toEqual({
            n: 'number',
            b: 'boolean',
            d: 'date',
            opt: 'number',
        });
    });

    it('buildPlan returns undefined when nothing to coerce', () => {
        const onlyString = z.object({ s: z.string() });
        expect(buildPlan(onlyString, 'query')).toBeUndefined();
    });

    it('apply transforms listed fields and passes through the rest', () => {
        const plan = buildPlan(schema, 'query')!;
        const out = apply(plan, {
            n: '42',
            b: 'true',
            d: '2026-01-01',
            s: 'kept',
        });
        expect(out.n).toBe(42);
        expect(out.b).toBe(true);
        expect(out.d).toBeInstanceOf(Date);
        expect(out.s).toBe('kept');
    });

    it('apply does not branch on non-listed fields', () => {
        const plan = buildPlan(schema, 'query')!;
        const out = apply(plan, { s: 'plain' });
        expect(out.s).toBe('plain');
    });

    it('apply passes through duplicate-key arrays (no coercion)', () => {
        const plan = buildPlan(schema, 'query')!;
        const out = apply(plan, { n: ['1', '2'] });
        expect(out.n).toEqual(['1', '2']);
    });

    it('a non-numeric coercion leaves the raw value so the validator rejects', () => {
        const plan = buildPlan(schema, 'query')!;
        const out = apply(plan, { n: 'abc' });
        // Number('abc') is NaN; rather than emitting NaN (which produces a
        // confusing "received nan" error), coercion leaves the original raw
        // string so the validator (z.number) rejects it with the real input.
        expect(out.n).toBe('abc');
    });
});
