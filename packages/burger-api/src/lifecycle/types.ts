import type { BurgerContext } from '../context/context';

/**
 * The forward lifecycle phases that run inside the single request pipeline.
 * `onError` is a separate error-path interceptor.
 *
 * The fixed forward order is:
 *   onRequest → Routing → transform → Validation → beforeRoute
 *   → Handler → afterRoute → mapResponse → applySet
 */
export type HookStage = 'beforeRoute' | 'afterRoute' | 'mapResponse';

/**
 * A lifecycle hook function.
 *
 * Uses the 3-return-type contract:
 *  - `beforeRoute` — `Response` short-circuits the pipeline; `undefined`
 *    continues.
 *  - `afterRoute` / `mapResponse` — `Response` replaces the response;
 *    `(res) => Response` transforms it; `undefined` / `void` continues.
 */
export type Hook = (ctx: BurgerContext) => unknown;

/**
 * An error-path interceptor hook. Runs when the pipeline throws (beforeRoute,
 * handler, afterRoute, mapResponse). Dispatched nearest-first (route → global)
 * so a route-level onError can handle its own errors before a global fallback.
 *
 * Returns a `Response` to handle the error, or `undefined`/`void` to let the
 * next onError in the chain try. If no onError handles it, the error re-throws
 * to the adapter fallback (`errorResponse`).
 */
export type ErrorHook = (
    error: Error,
    ctx: BurgerContext
) => Response | void | undefined;

/**
 * The frozen, per-route, per-phase hook plan. Composed ONCE at compile time
 * (RouterCompiler.compile) and executed inside the single pipeline.
 *
 * `beforeRoute[0]` is reserved for the wrapped validation hook
 * (pinned first by default). `onError` is a separate error-path array — it is
 * only consulted when the forward pipeline throws.
 */
export interface HookPlan {
    /** Runs global → route; includes the pinned validation hook at [0]. */
    beforeRoute: Hook[];
    /** Response-transform phase; runs route → global. */
    afterRoute: Hook[];
    /** Final mutation phase; may touch `ctx.set`; runs route → global. */
    mapResponse: Hook[];
    /** Error interceptor; runs nearest-first (route → global). */
    onError: ErrorHook[];
    /**
     * Transform factories that compute values to inject onto the context.
     * Runs before the handler, after `beforeRoute`. Never mutated at runtime.
     */
    transform?: TransformMap;
}

/**
 * A record of factory functions keyed by the context field name to inject.
 * Each factory receives the {@link BurgerContext} and returns the value to
 * shallow-merge onto the context instance.
 *
 * Example:
 * ```ts
 * export const transform = {
 *   user: (ctx) => loadUser(ctx),
 *   tenant: (ctx) => ctx.headers.get('X-Tenant'),
 * };
 * ```
 */
export type TransformMap = Record<string, (ctx: BurgerContext) => unknown>;

/**
 * The raw, uncompiled hook object carried on a `RouteModule` / `RouteDefinition`
 * from `hooks.ts`. Every value is normalized to a `Hook[]` / `ErrorHook[]` when
 * the plan is built.
 */
export interface RouteHooks {
    beforeRoute?: Hook | Hook[];
    afterRoute?: Hook | Hook[];
    mapResponse?: Hook | Hook[];
    onError?: ErrorHook | ErrorHook[];
    transform?: TransformMap;
}
