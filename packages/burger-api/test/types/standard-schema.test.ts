/**
 * Type-level tests for Standard Schema v1 support (non-Zod providers).
 * Standard Schema libraries type `~standard.types` as optional, so inference
 * must strip `undefined` before matching `{ output: infer O }`, and results
 * must be a success/failure union.
 */
import { describe, it, expect } from 'bun:test';
import { object, string, number } from 'valibot';
import type { BurgerContext } from '../../src/context/context';
import type { StandardSchemaV1 } from '../../src/validation/types';
import type { InferSchemaOutput } from '../../src/types/inference';
import type { SchemaInput } from '../../src/validation/types';

const valibotQuery = object({
    name: string(),
    age: number(),
});

type ValibotQuery = typeof valibotQuery;

describe('standard schema (valibot) typing', () => {
    it('valibot schemas are assignable to SchemaInput', () => {
        const slot: SchemaInput = valibotQuery;
        expect(slot).toBeDefined();
    });

    it('valibot schemas satisfy StandardSchemaV1', () => {
        const check: StandardSchemaV1 = valibotQuery as StandardSchemaV1;
        expect(check).toBeDefined();
    });

    it('infers the output type from ~standard.types.output', () => {
        type Out = InferSchemaOutput<ValibotQuery>;
        const output: Out = { name: 'a', age: 1 };
        expect(output).toEqual({ name: 'a', age: 1 });
        // Compile-time only: age must be a number, not a string.
        // @ts-expect-error age is typed number
        const bad: Out = { name: 'a', age: '1' };
        expect(bad).toBeDefined();
    });

    it('BurgerContext<typeof GET> types ctx.validated for valibot schemas', () => {
        const schema = { query: valibotQuery };
        const route = async (
            ctx: BurgerContext<typeof schema>
        ): Promise<Response> => {
            const name: string = ctx.validated.query.name;
            const age: number = ctx.validated.query.age;
            return Response.json({ name, age });
        };
        expect(route).toBeDefined();
    });
});