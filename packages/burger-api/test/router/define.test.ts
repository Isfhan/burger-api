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

    it('keeps body optional even when declared (JSON-only validation gate)', () => {
        const bodySchema = { body: z.object({ name: z.string() }) };
        defineRoute(bodySchema, (ctx) => {
            // @ts-expect-error body is validated only for JSON requests
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
                type Got = typeof ctx.validated.params;
                type Want = InferValidated<typeof schema>['params'];
                type _check = Expect<Equal<Got, Want>>;
                const check: _check = true;
                expect(check).toBe(true);
            },
            afterRoute: (ctx) => {
                // `ctx` here is BurgerContext<typeof schema>, not a plain one.
                type _isTyped = Expect<
                    Equal<typeof ctx, BurgerContext<typeof schema>>
                >;
                const isTyped: _isTyped = true;
                expect(isTyped).toBe(true);
            },
        });

        expect(typeof hooks.beforeRoute).toBe('function');
        expect(typeof hooks.afterRoute).toBe('function');
    });
});
