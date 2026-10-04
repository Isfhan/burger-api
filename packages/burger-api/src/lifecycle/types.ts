import type { BurgerContext } from '../context/context.js';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../validation/types.js';
import type { GlobalResponsePlan } from './executor.js';

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
 * `Response` short-circuits the pipeline; `(response) => Response` registers
 * an after-mapper applied in reverse collection order once the handler runs;
 * `undefined` / `void` continues. Promise variants cover async hooks.
 *
 * The mapper branch lets one hook (e.g. `cors()`) short-circuit a request and
 * still transform the eventual response; keep in sync with
 * `ResponseHookResult`.
 */
export type ForwardHookResult =
    | Response
    | ((response: Response) => Response | Promise<Response>)
    | void
    | undefined;

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
 * `beforeRoute`. May return an after-mapper function (see
 * {@link ForwardHookResult}) to transform the response once the handler runs.
 * Distinct from the `transform` hook point, which injects values onto the
 * context before the handler.
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
 * An error-path interceptor hook. Runs when the pipeline throws (validation,
 * beforeRoute, handler, afterRoute, mapResponse), dispatched nearest-first
 * (route → global) so a route-level onError can handle its own errors before
 * a global fallback.
 *
 * Returns a `Response` to handle the error, or `undefined`/`void` to let the
 * next onError try. If none handles it, the framework renders an RFC 9457
 * response (and logs 5xx errors server-side). May be async.
 */
export type ErrorHook = (
    error: Error,
    ctx: BurgerContext
) =>
    | Response
    | void
    | undefined
    | Promise<Response | void | undefined>;

/**
 * The frozen, per-route hook plan. Composed once at compile time and executed
 * inside the single pipeline.
 *
 * `validation` runs after `transform` and before `beforeRoute`. It is a single
 * hook (not an array) — a framework-owned stage, not a user-extensible hook
 * point. `onError` is a separate array consulted only when the forward
 * pipeline throws.
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
     * Runs after routing, before validation and `beforeRoute`. Never mutated
     * at runtime.
     */
    transform?: TransformMap;
    /** Compiled route validators; used for response validation post-handler. */
    validators?: CompiledRouteValidators;
    /** Whether the server is in dev mode (debug or non-production). Controls error rendering detail. */
    debug?: boolean;
    /** Global validation config (coerce, responseValidation, errorFormat, etc.). */
    validatorConfig?: ValidatorConfig;
    /**
     * Global/plugin response hooks (same shared plan on every route), so the
     * error path can run them on onError-rendered responses too. Set only
     * when the plan has hooks.
     */
    globalResponse?: GlobalResponsePlan;
}

/**
 * Factory functions keyed by the context field to inject. Each factory
 * receives the {@link BurgerContext} and its result is shallow-assigned onto
 * the context instance.
 *
 * ```ts
 * export const transform = {
 * user: (ctx) => loadUser(ctx),
 * tenant: (ctx) => ctx.headers.get('X-Tenant'),
 * };
 * ```
 */
export type TransformMap = Record<string, (ctx: BurgerContext) => unknown>;

/**
 * The raw, uncompiled hook object from a route's `hooks.ts` (or inline
 * `route.ts` export). Values are normalized to arrays when the plan is built.
 *
 * Route scope only — there is no `onRequest` here: it runs pre-routing,
 * before a route is matched, so declaring it in a route's `hooks.ts` is a
 * no-op. Use {@link GlobalHooks} (the app's `src/hooks.ts`) or a plugin's
 * `hooks` instead.
 */
export interface RouteHooks {
    beforeRoute?: ForwardHook | ForwardHook[];
    afterRoute?: ResponseHook | ResponseHook[];
    mapResponse?: ResponseHook | ResponseHook[];
    onError?: ErrorHook | ErrorHook[];
    transform?: TransformMap;
}

/**
 * Hook object for scopes that run before routing: the app's `src/hooks.ts` and
 * plugin `hooks`. Adds `onRequest` (pre-routing, so app-wide or plugin-wide
 * only) on top of {@link RouteHooks}.
 */
export interface GlobalHooks extends RouteHooks {
    /** Pre-routing hook — runs before the route is matched. */
    onRequest?: ForwardHook | ForwardHook[];
}
