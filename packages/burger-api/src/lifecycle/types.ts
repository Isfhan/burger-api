import type { BurgerRequest } from '../types/index';

/**
 * The forward lifecycle phases that run inside the single request pipeline.
 * `onError` is a separate error-path interceptor (Phase 4 M2).
 *
 * Per ROADMAP.md §4.1 the fixed forward order is:
 *   beforeHandle → handler → afterHandle → onResponse → applySet
 */
export type HookStage = 'beforeHandle' | 'afterHandle' | 'onResponse';

/**
 * A lifecycle hook function.
 *
 * Uses the 3-return-type contract:
 *  - `beforeHandle` — `Response` short-circuits the pipeline; `undefined`
 *    continues.
 *  - `afterHandle` / `onResponse` — `Response` replaces the response;
 *    `(res) => Response` transforms it; `undefined` / `void` continues.
 */
export type Hook = (req: BurgerRequest) => unknown;

/**
 * An error-path interceptor hook. Runs when the pipeline throws (beforeHandle,
 * handler, afterHandle, onResponse). Dispatched nearest-first (route → global)
 * so a route-level onError can handle its own errors before a global fallback.
 *
 * Returns a `Response` to handle the error, or `undefined`/`void` to let the
 * next onError in the chain try. If no onError handles it, the error re-throws
 * to the adapter fallback (`errorResponse`).
 */
export type ErrorHook = (
    error: Error,
    req: BurgerRequest
) => Response | void | undefined;

/**
 * The frozen, per-route, per-phase hook plan. Composed ONCE at compile time
 * (RouterCompiler.compile) and executed inside the single pipeline.
 *
 * `beforeHandle[0]` is reserved for the wrapped Phase 3 validation middleware
 * (pinned first by default). `onError` is a separate error-path array — it is
 * only consulted when the forward pipeline throws.
 */
export interface HookPlan {
    /** Runs global → route; includes the pinned validation middleware at [0]. */
    beforeHandle: Hook[];
    /** Response-transform phase; runs global → route. */
    afterHandle: Hook[];
    /** Final mutation phase; may touch `ctx.set`; runs global → route. */
    onResponse: Hook[];
    /** Error interceptor; runs nearest-first (route → global). */
    onError: ErrorHook[];
    /**
     * Provide factories that compute values to inject onto the context.
     * Runs before the handler, after `beforeHandle`. Never mutated at runtime.
     */
    provide?: ProvideMap;
}

/**
 * A record of factory functions keyed by the context field name to inject.
 * Each factory receives the {@link BurgerRequest} and returns the value to
 * shallow-merge onto the context instance (Phase 4 M3 — `provide`).
 *
 * Example:
 * ```ts
 * export const provide = {
 *   user: (req) => loadUser(req),
 *   tenant: (req) => req.headers.get('X-Tenant'),
 * };
 * ```
 */
export type ProvideMap = Record<string, (req: BurgerRequest) => unknown>;

/**
 * The raw, uncompiled hook object carried on a `RouteModule` / `RouteDefinition`
 * from `hooks.ts`. Every value is normalized to a `Hook[]` / `ErrorHook[]` when
 * the plan is built.
 *
 * Accepts both legacy names (beforeHandle, afterHandle, onResponse, provide)
 * and vision names (beforeRoute, afterRoute, mapResponse, transform).
 */
export interface RouteHooks {
    beforeHandle?: Hook | Hook[];
    afterHandle?: Hook | Hook[];
    onResponse?: Hook | Hook[];
    onError?: ErrorHook | ErrorHook[];
    provide?: ProvideMap;
    // Vision names (alias for legacy)
    beforeRoute?: Hook | Hook[];
    afterRoute?: Hook | Hook[];
    mapResponse?: Hook | Hook[];
    transform?: ProvideMap;
}

/**
 * Normalizes hook object from vision names to legacy internal names.
 * Vision: beforeRoute → beforeHandle, afterRoute → afterHandle,
 *         mapResponse → onResponse, transform → provide
 */
export function normalizeHooks(raw: RouteHooks | undefined): RouteHooks | undefined {
    if (!raw) return undefined;
    const out: RouteHooks = { ...raw };

    // Map vision names to legacy names (legacy takes precedence if both present)
    if (out.beforeRoute && !out.beforeHandle) out.beforeHandle = out.beforeRoute;
    if (out.afterRoute && !out.afterHandle) out.afterHandle = out.afterRoute;
    if (out.mapResponse && !out.onResponse) out.onResponse = out.mapResponse;
    if (out.transform && !out.provide) out.provide = out.transform;

    return out;
}
