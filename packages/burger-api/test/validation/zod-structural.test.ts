import { describe, it, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
    detectAdapter,
    isZodSchema,
    __setZodAdapter,
} from '../../src/validation/adapter';
import { ZodAdapter } from '../../src/validation/adapters/zod';
import { buildPlan } from '../../src/validation/coerce';

__setZodAdapter(ZodAdapter);

/** A structural fake: not `instanceof` our zod, but carries the `_zod` marker. */
function fakeNumberSchema() {
    class ZodNumber {
        _zod = { def: { type: 'number' } };
    }
    return {
        _zod: { def: { type: 'object' } },
        shape: { n: new ZodNumber() },
    };
}

const secondCopyPath = path.join(
    import.meta.dir,
    '../../../../node_modules/.bun/zod@4.4.3/node_modules/zod/index.js'
);
const hasSecondCopy = existsSync(secondCopyPath);

describe('structural Zod detection', () => {
    it('detects a non-instance schema by the _zod marker', () => {
        expect(isZodSchema(fakeNumberSchema())).toBe(true);
        expect(detectAdapter(fakeNumberSchema() as never)).toBe(ZodAdapter);
    });

    it('rejects values without a _zod object', () => {
        expect(isZodSchema({})).toBe(false);
        expect(isZodSchema(null)).toBe(false);
        expect(isZodSchema(undefined)).toBe(false);
        expect(isZodSchema({ _zod: 'nope' })).toBe(false);
    });

    it('builds a coercion plan for a structural fake', () => {
        const plan = buildPlan(fakeNumberSchema() as never, 'query');
        expect(plan?.fields.n).toBe('number');
    });

    it.skipIf(!hasSecondCopy)(
        'coerces and detects schemas from a second zod copy',
        async () => {
            const { z: z2 } = await import(secondCopyPath);
            expect(z2).not.toBe(z);
            const schema = z2.object({ n: z2.number(), b: z2.boolean() });
            expect(detectAdapter(schema as never)).toBe(ZodAdapter);
            const plan = buildPlan(schema as never, 'query');
            expect(plan?.fields.n).toBe('number');
            expect(plan?.fields.b).toBe('boolean');
        }
    );
});
