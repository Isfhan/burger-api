import type { RouteDefinition } from '../types/index.js';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../validation/types.js';
import type { ContextInit, RouteAccessInfo, RouteMeta } from '../context/types.js';
import type { HTTPMethod } from '../utils/routing.js';

/**
 * A compiled route handler — the same shape for static (Bun-dispatched) and
 * dynamic/wildcard (trie-dispatched) routes, so method dispatch, 405+Allow,
 * auto-HEAD, and lifecycle behavior are identical on both paths.
 *
 * `prebuilt` is the pre-routing `BurgerContext` (created before routing so
 * `onRequest` hooks can seed state); when provided, the handler binds it
 * instead of allocating a second context. `env` / `executionCtx` are the
 * platform bindings forwarded from the serving entry point.
 */
export type CompiledHandler = (
    request: Request,
    ctxInit?: ContextInit,
    prebuilt?: import('../context/context.js').BurgerContext,
    env?: import('../context/context.js').BurgerEnv,
    executionCtx?: import('../context/context.js').BurgerExecutionContext
) => Response | Promise<Response>;

/**
 * A route+method executor specialized at compile time. May return
 * synchronously — a route with an empty hook plan does not force a Promise.
 *
 * `ctxInit` is supplied by the `fetch` fallback (trie / loose-slash); the
 * native Bun path omits it and derives params from Bun's already-decoded
 * `request.params`.
 */
export type RouteCore = (
    request: Request,
    ctxInit?: ContextInit,
    prebuilt?: import('../context/context.js').BurgerContext,
    env?: import('../context/context.js').BurgerEnv,
    executionCtx?: import('../context/context.js').BurgerExecutionContext
) => Response | Promise<Response>;

/** Per-method executors for one route, keyed by HTTP method. */
export type NativeMethodCores = Partial<Record<HTTPMethod, RouteCore>>;

/**
 * A Bun `routes` method object value: Bun invokes it with `(request, server)`.
 */
export type NativeMethodHandler = (
    request: Request,
    server?: unknown
) => Response | Promise<Response>;

/**
 * A Bun `routes` method object: one specialized handler per defined method
 * (including the framework's derived `HEAD` and auto `OPTIONS`). A method
 * not present here falls through to the `fetch` fallback, where the
 * trie/static dispatcher answers 405 + Allow.
 */
export type NativeMethodHandlers = Partial<Record<HTTPMethod, NativeMethodHandler>>;

/**
 * A route compiled into its dispatch structures.
 */
export interface CompiledRoute {
    def: RouteDefinition;
    handler: CompiledHandler;
    methods: string[];
    allow: string;
    /** The matched-route identity (`path` + `pattern`), retained for introspection. */
    route?: RouteMeta;
    /** The optional RouteAccessAnalyzer hint (unused at runtime). */
    meta?: RouteAccessInfo;
    /** The precompiled validators for this route. Undefined when the
     * route has no `schema`. Consumed by the validation orchestrator. */
    validators?: CompiledRouteValidators;
}

/**
 * The output of a single RouterCompiler.compile pass.
 */
export interface CompiledRouter {
    staticMap: import('./static-map.js').StaticMap;
    trie: import('./trie.js').Trie;
    allowCache: import('./allow-cache.js').AllowCache;
    /**
     * Native dispatch table for `:param` / `*` routes, keyed by their Bun
     * pattern (e.g. `/users/:id`). Consumed only by the Bun adapter, which
     * registers them on `Bun.serve`'s `routes` map; non-Bun adapters ignore
     * this and dispatch via the trie + `fetch` fallback.
     */
    nativeRoutes: Map<string, CompiledHandler>;
    /**
     * Per-route per-method specialized executors, keyed by path. Used by
     * `Router.staticRoutes()` / `Router.nativeRoutes()` to build Bun method
     * objects; the `fetch` fallback reuses them through `CompiledHandler`s.
     */
    methodCores: Map<string, NativeMethodCores>;
    /**
     * Retained compiled-route metadata (RouteAccessInfo + RouteMeta) keyed by
     * path. Build-time only; never read on the request hot path.
     */
    routes?: Map<string, CompiledRoute>;
}

/**
 * Configuration for the Router / RouterCompiler.
 */
export interface RouterConfig {
    /** When true, the optional RouteAccessAnalyzer is skipped at compile time. */
    debug?: boolean;
    /** validation configuration (coercion / response / errors). */
    validation?: ValidatorConfig;
    /**
     * Dynamic-route dispatch engine for the `fetch` fallback path.
     * - `'auto'` (default) and `'trie'`: the radix trie.
     * - `'regex'`: opt-in RegExp matcher (trie-ordered); falls back to the
     *   trie if its build bails out.
     *
     * Static routes are unaffected — they never reach this dispatch.
     */
    engine?: 'auto' | 'regex' | 'trie';
    /**
     * JIT-compile each route's HookPlan into one async function
     * (`lifecycle/jit.ts`). ON by default — capability-probed per process;
     * runtimes without dynamic codegen keep the interpreter. Set `false` to
     * force the interpreter everywhere.
     */
    jit?: boolean;
}
