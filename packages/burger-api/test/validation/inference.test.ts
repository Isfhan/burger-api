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

// Declared params/query/headers/cookies slots are non-optional; body stays
// optional. Asserted via mutual assignability (the Equal trick cannot see
// through intersections of single-key mapped types with optional members).
type _check1 = Expect<V extends {
    params: { id: string };
    query: { q?: string };
    headers: { authorization: string };
    cookies: { session: string };
    body?: { name: string; age: number };
} ? true : false>;
type _check2 = Expect<{
    params: { id: string };
    query: { q?: string };
    headers: { authorization: string };
    cookies: { session: string };
    body?: { name: string; age: number };
} extends V ? true : false>;

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
            Empty extends {
                params?: unknown;
                query?: unknown;
                headers?: unknown;
                cookies?: unknown;
                body?: unknown;
            }
                ? true
                : false
        >;
        type E2 = Expect<
            {
                params?: unknown;
                query?: unknown;
                headers?: unknown;
                cookies?: unknown;
                body?: unknown;
            } extends Empty
                ? true
                : false
        >;
        const e: E = true;
        const e2: E2 = true;
        expect([e, e2]).toEqual([true, true]);
    });

    it('treats model-string refs as unknown', () => {
        // body is a MaybeSlot (JSON-only gate) → optional unknown.
        type M = InferValidated<{ body: 'user/create' }>;
        type E = Expect<Equal<M['body'], unknown | undefined>>;
        const e: E = true;
        expect(e).toBe(true);

        // query is an AlwaysSlot → non-optional unknown.
        type Q = InferValidated<{ query: 'Pagination' }>;
        type E2 = Expect<Equal<Q['query'], unknown>>;
        const e2: E2 = true;
        expect(e2).toBe(true);
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
