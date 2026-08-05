import type { BurgerContext } from '../context/context';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../validation/types';

/**
 * The forward hook points that run inside the single request pipeline.
 * `onError` is a separate error-path interceptor.
 *
 * The fixed forward order is:
 * onRequest → Routing → transform → Validation → beforeRoute
 * → Handler → afterRoute → mapResponse → applySet
 */
export type HookStage =
    'validation' | 'beforeRoute' | 'afterRoute' | 'mapResponse';

/**
 * A lifecycle hook function.
 *
 * Uses the 3-return-type contract:
 * - `beforeRoute` — `Response` short-circuits the pipeline; `undefined`
 * continues.
 * - `afterRoute` / `mapResponse` — `Response` replaces the response;
 * `(res) => Response` transforms it; `undefined` / `void` continues.
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
 * The frozen, per-route hook plan. Composed ONCE at compile time
 * (RouterCompiler.compile) and executed inside the single pipeline.
 *
 * `validation` runs after `transform` but before `beforeRoute`. It is a
 * single hook (not an array) — validation is a framework-owned stage, not
 * a user-extensible hook point.
 *
 * `onError` is a separate error-path array — it is only consulted when
 * the forward pipeline throws.
 */
export interface HookPlan {
    /** Framework-owned validation stage; runs after transform, before beforeRoute. */
    validation?: Hook;
    /** Runs global → route. */
    beforeRoute: Hook[];
    /** Response-transform hooks; run route → global. */
    afterRoute: Hook[];
    /** Final response hooks; may touch `ctx.set`; run route → global. */
    mapResponse: Hook[];
    /** Error interceptor; runs nearest-first (route → global). */
    onError: ErrorHook[];
    /**
     * Transform factories that compute values to inject onto the context.
     * Runs before the handler, after `beforeRoute`. Never mutated at runtime.
     */
    transform?: TransformMap;
    /** Compiled route validators; used for response validation post-handler. */
    validators?: CompiledRouteValidators;
    /** Whether the server is in dev mode (debug or non-production). Controls error rendering detail. */
    debug?: boolean;
    /** Global validation config (coerce, responseValidation, errorFormat, etc.). */
    validatorConfig?: ValidatorConfig;
}

/**
 * A record of factory functions keyed by the context field name to inject.
 * Each factory receives the {@link BurgerContext} and returns the value to
 * shallow-merge onto the context instance.
 *
 * Example:
 * ```ts
 * export const transform = {
 * user: (ctx) => loadUser(ctx),
 * tenant: (ctx) => ctx.headers.get('X-Tenant'),
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
    /** Pre-routing hook — runs before the route is matched. App-level only. */
    onRequest?: Hook | Hook[];
    beforeRoute?: Hook | Hook[];
    afterRoute?: Hook | Hook[];
    mapResponse?: Hook | Hook[];
    onError?: ErrorHook | ErrorHook[];
    transform?: TransformMap;
}
