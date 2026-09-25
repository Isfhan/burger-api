/**
 * Strict coercion: empty/whitespace, hex, exponent, and impossible-date
 * inputs must fail validation instead of silently coercing.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import {
    compileRouteSchema,
    clearValidatorCache,
} from '../../src/validation/compiler';
import { createValidationHook } from '../../src/validation/validator';
import { ValidationError } from '../../src/validation/error';
import type { BurgerContext } from '../../src/context/context';

/** Builds a minimal BurgerContext-like object for the orchestrator. */
function fakeCtx(query: Record<string, string>): BurgerContext {
    const headers = new Headers();
    return {
        method: 'get',
        params: {},
        query,
        headers,
        validated: undefined,
        json: async () => ({}),
    } as unknown as BurgerContext;
}

async function validateQuery(
    schema: unknown,
    query: Record<string, string>
): Promise<BurgerContext> {
    const validators = compileRouteSchema(schema as never, { coerce: true });
    const hook = createValidationHook(validators);
    const ctx = fakeCtx(query);
    await hook(ctx);
    return ctx;
}

describe('strict coercion', () => {
    beforeEach(() => clearValidatorCache());

    const numberSchema = {
        get: { query: z.object({ n: z.number() }), coerce: true },
    };

    it('rejects an empty value instead of coercing to 0', async () => {
        await expect(validateQuery(numberSchema, { n: '' })).rejects.toThrow(
            ValidationError
        );
        await expect(
            validateQuery(numberSchema, { n: '   ' })
        ).rejects.toThrow(ValidationError);
    });

    it('rejects hex, exponent, and non-decimal forms', async () => {
        for (const bad of ['0x1f', '1e3', 'Infinity', 'NaN', '1,5']) {
            await expect(
                validateQuery(numberSchema, { n: bad })
            ).rejects.toThrow(ValidationError);
        }
    });

    it('still coerces plain decimal numbers', async () => {
        const ctx = await validateQuery(numberSchema, { n: '3.14' });
        expect((ctx.validated as any).query).toEqual({ n: 3.14 });
        const ctx2 = await validateQuery(numberSchema, { n: '-7' });
        expect((ctx2.validated as any).query).toEqual({ n: -7 });
    });

    it('rejects numeric strings as dates', async () => {
        const dateSchema = {
            get: { query: z.object({ d: z.date() }), coerce: true },
        };
        await expect(validateQuery(dateSchema, { d: '42' })).rejects.toThrow(
            ValidationError
        );
    });

    it('rejects impossible calendar dates', async () => {
        const dateSchema = {
            get: { query: z.object({ d: z.date() }), coerce: true },
        };
        await expect(
            validateQuery(dateSchema, { d: '2026-02-30' })
        ).rejects.toThrow(ValidationError);
        await expect(
            validateQuery(dateSchema, { d: '2026-13-01' })
        ).rejects.toThrow(ValidationError);
    });

    it('still parses valid ISO dates', async () => {
        const dateSchema = {
            get: { query: z.object({ d: z.date() }), coerce: true },
        };
        const ctx = await validateQuery(dateSchema, { d: '2026-02-28' });
        const d = (ctx.validated as any).query.d;
        expect(d).toBeInstanceOf(Date);
        expect(d.toISOString().slice(0, 10)).toBe('2026-02-28');

        const ctx2 = await validateQuery(dateSchema, {
            d: '2026-02-28T10:00:00Z',
        });
        expect(ctx2.validated).toBeDefined();
    });
});