import type { RouteDefinition } from '../types/index';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../validation/types';
import type { ContextInit, RouteAccessInfo, RouteMeta } from '../context/types';

/**
 * A compiled route handler.
 * Both static (Bun-dispatched) and dynamic/wildcard (trie-dispatched) routes
 * execute exactly this same handler shape, guaranteeing identical method
 * dispatch, 405+Allow, auto-HEAD, and lifecycle behavior regardless of which
 * lookup mechanism reached it.
 *
 * The handler receives the raw `Request`, an optional `ctxInit` (seeded by
 * `Router.fetch`) and an optional pre-built `BurgerContext` (created by the
 * router before routing so `onRequest` hooks can seed state). When
 * `prebuilt` is provided, the handler binds it to the matched route instead
 * of allocating a second context — one context per request.
 *
 * `env` / `executionCtx` are the platform bindings forwarded from the
 * serving entry point (`toFetchHandler`); they are bound onto the context
 * at creation time. When a prebuilt context exists they were already bound
 * there — passing them again is harmless (bind carries them over).
 */
export type CompiledHandler = (
    request: Request,
    ctxInit?: ContextInit,
    prebuilt?: import('../context/context').BurgerContext,
    env?: import('../context/context').BurgerEnv,
    executionCtx?: import('../context/context').BurgerExecutionContext
) => Promise<Response>;

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
    /** The optional RouteAccessAnalyzer hint (unused at runtime ). */
    meta?: RouteAccessInfo;
    /** The precompiled validators for this route. Undefined when the
     * route has no `schema`. Consumed by the validation orchestrator. */
    validators?: CompiledRouteValidators;
}

/**
 * The output of a single RouterCompiler.compile pass.
 */
export interface CompiledRouter {
    staticMap: import('./static-map').StaticMap;
    trie: import('./trie').Trie;
    allowCache: import('./allow-cache').AllowCache;
    /**
     * Native dispatch table for `:param` / `*` routes, keyed by their Bun-native
     * pattern (e.g. `/users/:id`). Consumed only by the Bun adapter, which
     * registers them on `Bun.serve`'s `routes` map so dynamic routes skip the
     * `fetch` fallback. The handlers self-extract params (Web-Standard), so the
     * logic is runtime-agnostic; non-Bun adapters ignore this and dispatch via
     * the trie + `fetch` fallback.
     */
    nativeRoutes: Map<string, CompiledHandler>;
    /**
     * Retained compiled-route metadata (RouteAccessInfo + RouteMeta) keyed by
     * path. Build-time only; never consulted on the request hot path.
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
     * - `'auto'` (default) and `'trie'`: the radix trie — measured
     *   equal-or-faster than the compiled alternation (see
     *   burger-api-benchmarks `optimize/many-*`).
     * - `'regex'`: opt-in Hono-style RegExp matcher (trie-ordered, parity-
     *   tested in test/router/regex-parity.test.ts); falls back to the trie
     *   if its build bails out.
     *
     * Static routes are unaffected — they never reach this dispatch.
     */
    engine?: 'auto' | 'regex' | 'trie';
    /**
     * JIT-compile each route's HookPlan into one async function
     * (`lifecycle/jit.ts`). ON by default — capability-probed per process;
     * runtimes without dynamic codegen silently keep the interpreter.
     * Set `false` to force the interpreter everywhere.
     */
    jit?: boolean;
}
