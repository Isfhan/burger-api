/**
 * Type-level tests for `defineRoute`/`defineHooks` (`src/router/define.ts`):
 * confirm the schema-bound `ctx` they infer is identical to what a
 * hand-written `BurgerContext<typeof schema>` generic already produces, and
 * that hook signatures narrow the same way. Compile-time assertions, gated
 * by the `tsc --noEmit` typecheck script — they pass trivially at runtime.
 */
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { defineHooks, defineRoute } from '../../src/router/define';
import type { HookContext } from '../../src/router/define';
import type { BurgerContext } from '../../src/context/context';
import type { InferValidated } from '../../src/types/inference';

const schema = {
    params: z.object({ id: z.string() }),
    query: z.object({ q: z.string().optional() }),
};

type Expect<T extends true> = T;
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? true
        : false;

describe('defineRoute', () => {
    it('infers ctx.validated identically to BurgerContext<typeof schema>', () => {
        let capturedQ: unknown;
        const handler = defineRoute(schema, (ctx) => {
            type Got = typeof ctx.validated.query;
            type Want = InferValidated<typeof schema>['query'];
            type _check = Expect<Equal<Got, Want>>;
            const check: _check = true;
            capturedQ = check;
            return new Response('ok');
        });

        expect(typeof handler).toBe('function');
        // Runtime behavior is untouched — defineRoute returns the handler as-is.
        expect(capturedQ).toBeUndefined();
    });

    it('types a declared body as always present (non-JSON bodies get 415)', () => {
        const bodySchema = { body: z.object({ name: z.string() }) };
        defineRoute(bodySchema, (ctx) => {
            const name: string = ctx.validated.body.name;
            return new Response(name);
        });
    });

    it('accepts a response-only schema (regression: TS2559 "no properties in common" against a request-slot-only bound)', () => {
        const responseOnlySchema = {
            response: { 200: z.object({ ok: z.boolean() }) },
        };
        const handler = defineRoute(responseOnlySchema, () => {
            return new Response('ok');
        });
        expect(typeof handler).toBe('function');
    });
});

describe('defineHooks', () => {
    it('types beforeRoute/afterRoute ctx from the same schema', () => {
        const hooks = defineHooks(schema, {
            beforeRoute: (ctx) => {
                // Hooks run for every method: each slot may be undefined.
                type Got = typeof ctx.validated.params;
                type Want = InferValidated<typeof schema>['params'] | undefined;
                type _check = Expect<Equal<Got, Want>>;
                const check: _check = true;
                expect(check).toBe(true);
            },
            afterRoute: (ctx) => {
                // `ctx` here is HookContext<typeof schema>, not a plain one.
                type _isTyped = Expect<
                    Equal<typeof ctx, HookContext<typeof schema>>
                >;
                const isTyped: _isTyped = true;
                expect(isTyped).toBe(true);
            },
        });

        expect(typeof hooks.beforeRoute).toBe('function');

        // Hooks run for every method (a POST has no GET query): unguarded
        // slot access is a compile error; after validation the bag exists.
        defineHooks(schema, {
            beforeRoute: (ctx) => {
                // @ts-expect-error query may be undefined on another method
                void ctx.validated.query.q;
                void ctx.validated.query?.q;
            },
        });
        expect(typeof hooks.afterRoute).toBe('function');
    });
});
