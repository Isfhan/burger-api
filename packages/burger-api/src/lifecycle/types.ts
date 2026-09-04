import type { BurgerContext } from '../context/context.js';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../validation/types.js';

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
 * The return contract of a forward (pre-handler) hook:
 * `Response` short-circuits the pipeline; `undefined` / `void` continues.
 * The `Promise` variants cover async hooks.
 */
export type ForwardHookResult = Response | void | undefined;

/**
 * The return contract of a response hook (`afterRoute` / `mapResponse`):
 * `Response` replaces the response; `(response) => Response` transforms it;
 * `undefined` / `void` continues. The `Promise` variants cover async hooks.
 */
export type ResponseHookResult =
    | Response
    | ((response: Response) => Response | Promise<Response>)
    | void
    | undefined;

/**
 * A forward (pre-handler) lifecycle hook — `onRequest`, `validation`,
 * `beforeRoute`. Transform functions are NOT part of the forward contract —
 * they belong on the response hook points.
 */
export type ForwardHook = (
    ctx: BurgerContext
) => ForwardHookResult | Promise<ForwardHookResult>;

/**
 * A response lifecycle hook — `afterRoute`, `mapResponse`.
 */
export type ResponseHook = (
    ctx: BurgerContext
) => ResponseHookResult | Promise<ResponseHookResult>;

/**
 * A lifecycle hook function — the union of the stage-precise contracts.
 * Kept for backward compatibility; prefer `ForwardHook` / `ResponseHook`
 * when a stage is known.
 */
export type Hook = ForwardHook | ResponseHook;

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
    validation?: ForwardHook;
    /** Runs global → route. */
    beforeRoute: ForwardHook[];
    /** Response-transform hooks; run route → global. */
    afterRoute: ResponseHook[];
    /** Final response hooks; may touch `ctx.set`; run route → global. */
    mapResponse: ResponseHook[];
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
 * from a route's `hooks.ts` (or inline `route.ts` export). Every value is
 * normalized to a `Hook[]` / `ErrorHook[]` when the plan is built.
 *
 * Route scope only — there is no `onRequest` here. `onRequest` runs
 * pre-routing, before a route is even matched, so it cannot be scoped to one
 * route; declaring it in a route's `hooks.ts` is always a no-op. Use
 * {@link GlobalHooks} (the app's `src/hooks.ts`) or a plugin's `hooks` for
 * `onRequest`.
 */
export interface RouteHooks {
    beforeRoute?: ForwardHook | ForwardHook[];
    afterRoute?: ResponseHook | ResponseHook[];
    mapResponse?: ResponseHook | ResponseHook[];
    onError?: ErrorHook | ErrorHook[];
    transform?: TransformMap;
}

/**
 * The hook object shape for scopes that run before routing: the app's global
 * `src/hooks.ts` and plugin `hooks`. Adds `onRequest` on top of
 * {@link RouteHooks} — the pre-routing hook that runs before a route is
 * matched, so it can only apply app-wide or plugin-wide, never per-route.
 */
export interface GlobalHooks extends RouteHooks {
    /** Pre-routing hook — runs before the route is matched. */
    onRequest?: ForwardHook | ForwardHook[];
}
