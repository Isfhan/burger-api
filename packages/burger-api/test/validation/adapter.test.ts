import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { detectAdapter } from '../../src/validation/adapter';
import { ZodAdapter } from '../../src/validation/adapters/zod';

describe('ValidatorAdapter detection (M1)', () => {
    it('returns the Zod adapter for a Zod schema', () => {
        const schema = z.object({ id: z.string() });
        expect(detectAdapter(schema)).toBe(ZodAdapter);
    });

    it('throws for a non-Zod, non-Standard Schema value', () => {
        expect(() => detectAdapter({} as any)).toThrow(/Unsupported schema/);
        expect(() => detectAdapter(42 as any)).toThrow(/Unsupported schema/);
        expect(() => detectAdapter('plain string' as any)).toThrow(
            /Unsupported schema/
        );
    });

    it('throws for an object lacking the ~standard contract', () => {
        const fake = { something: 'else' } as any;
        expect(() => detectAdapter(fake)).toThrow(/Unsupported schema/);
    });
});
