import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import type {
    BurgerContext,
    InferSchemaOutput,
    InferValidated,
} from 'burger-api';

const schema = {
    params: z.object({ id: z.string() }),
    query: z.object({ q: z.string().optional() }),
    body: z.object({ name: z.string(), age: z.number() }),
    headers: z.object({ authorization: z.string() }),
    cookies: z.object({ session: z.string() }),
};

type Route = typeof schema;

type V = InferValidated<Route>;

type Expect<T extends true> = T;
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? true
        : false;

type _check = Expect<
    Equal<
        V,
        {
            params?: { id: string };
            query?: { q?: string };
            headers?: { authorization: string };
            cookies?: { session: string };
            body?: { name: string; age: number };
        }
    >
>;

describe('InferValidated', () => {
    it('maps schema slots to inferred output types', () => {
        type P = V['params'];
        type Q = V['query'];
        type B = V['body'];
        const p: P = { id: '1' };
        const q: Q = {};
        const b: B = { name: 'x', age: 1 };
        expect(p.id).toBe('1');
        expect(q.q).toBeUndefined();
        expect(b.name).toBe('x');
    });

    it('falls back to unknown slots for empty routes', () => {
        type Empty = InferValidated<{}>;
        type E = Expect<
            Equal<
                Empty,
                {
                    params?: unknown;
                    query?: unknown;
                    headers?: unknown;
                    cookies?: unknown;
                    body?: unknown;
                }
            >
        >;
        const e: E = true;
        expect(e).toBe(true);
    });

    it('treats model-string refs as unknown', () => {
        type M = InferValidated<{ body: 'user/create' }>;
        type E = Expect<Equal<M['body'], unknown>>;
        const e: E = true;
        expect(e).toBe(true);
    });

    it('infers Standard Schema v1 output types', () => {
        type Std = InferSchemaOutput<{
            '~standard': {
                version: 1;
                vendor: 'test';
                validate: () => { value: unknown };
                types: { input: unknown; output: { ok: boolean } };
            };
        }>;
        type E = Expect<Equal<Std, { ok: boolean }>>;
        const e: E = true;
        expect(e).toBe(true);
    });

    it('types ctx.validated via the generic context', () => {
        type Ctx = BurgerContext<typeof schema>;
        type V2 = NonNullable<Ctx['validated']>;
        type E = Expect<
            Equal<V2['body'], { name: string; age: number } | undefined>
        >;
        const e: E = true;
        expect(e).toBe(true);
    });
});
