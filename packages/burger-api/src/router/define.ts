/**
 * Ergonomic seam over the existing schema→context inference
 * (`types/inference.ts`, `BurgerContext<TRoute>`): `route.ts`/`hooks.ts`
 * still hand-import the sibling `schema.ts` export, but the generic no
 * longer has to be hand-typed onto `BurgerContext`. Passing the schema as
 * the first argument means the type argument and the runtime value can
 * never drift apart — same two-file convention, no new runtime behavior.
 *
 * ```ts
 * // route.ts
 * import { defineRoute } from 'burger-api';
 * import { GET as GetSchema } from './schema';
 *
 * export const GET = defineRoute(GetSchema, (ctx) => {
 *     ctx.validated.query; // inferred, no manual generic
 * });
 * ```
 */

import type { BurgerContext } from '../context/context.js';
import type { MethodSchema, RequestHandler } from '../types/index.js';
import type {
    ErrorHook,
    ForwardHookResult,
    ResponseHookResult,
    RouteHooks,
} from '../lifecycle/types.js';

/** Identity wrapper: infers `ctx` from `schema`, returns `handler` unchanged. */
export function defineRoute<T extends MethodSchema>(
    schema: T,
    handler: (ctx: BurgerContext<T>) => Promise<Response> | Response
): RequestHandler {
    return handler as RequestHandler;
}

type TypedForwardHook<T> = (
    ctx: BurgerContext<T>
) => ForwardHookResult | Promise<ForwardHookResult>;

type TypedResponseHook<T> = (
    ctx: BurgerContext<T>
) => ResponseHookResult | Promise<ResponseHookResult>;

type TypedErrorHook<T> = (
    error: Error,
    ctx: BurgerContext<T>
) => ReturnType<ErrorHook>;

/**
 * The `hooks.ts` counterpart to {@link defineRoute}'s handler typing —
 * same field shapes as {@link RouteHooks}, with `ctx` bound to the route's
 * schema instead of a plain `BurgerContext`.
 */
export interface TypedRouteHooks<T> {
    beforeRoute?: TypedForwardHook<T> | TypedForwardHook<T>[];
    afterRoute?: TypedResponseHook<T> | TypedResponseHook<T>[];
    mapResponse?: TypedResponseHook<T> | TypedResponseHook<T>[];
    onError?: TypedErrorHook<T> | TypedErrorHook<T>[];
    transform?: Record<string, (ctx: BurgerContext<T>) => unknown>;
}

/** Identity wrapper: infers every hook's `ctx` from `schema`, returns `hooks` unchanged. */
export function defineHooks<T extends MethodSchema>(
    schema: T,
    hooks: TypedRouteHooks<T>
): RouteHooks {
    return hooks as unknown as RouteHooks;
}
