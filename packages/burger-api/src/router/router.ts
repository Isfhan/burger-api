import { renderHTTPError } from '../errors/http-error.js';
import type { ContextInit } from '../context/types.js';
import { notFound, methodNotAllowed } from '../utils/response.js';
import { normalizePath } from '../utils/index.js';
import { extractPathnameFromUrl } from '../utils/wildcard.js';
import { RouterCompiler } from './compiler.js';
import { AllowCache } from './allow-cache.js';
import { StaticMap } from './static-map.js';
import { Trie } from './trie.js';
import {
    buildRegexMatcher,
    type RegexMatch,
    type RegexRouteEntry,
} from './regex-matcher.js';
import type { CompiledHandler, CompiledRoute, RouterConfig } from './types.js';
import type { ValidatorConfig } from '../validation/types.js';
import type { ResolvedPlugin } from '../plugin/types.js';
import type { Hook } from '../lifecycle/types.js';
import { BurgerContext } from '../context/context.js';

interface OnRequestOutcome {
    shortCircuit: Response | undefined;
    mappers: ((res: Response) => Response | Promise<Response>)[];
    /**
     * THE per-request context. Created here so `onRequest` hooks can seed
     * state (request IDs, counters, …) that survives into the handler —
     * the dispatched route binds this same instance instead of allocating
     * a second context.
     */
    ctx: BurgerContext;
}

/**
 * Public router that owns the compiled dispatch state and orchestrates
 * lookup + execution.
 *
 * - Static routes are served by Bun's native `routes` map (via `staticRoutes()`).
 * - Dynamic (`:param`) and wildcard (`*`) routes are ALSO served by Bun's native
 * `routes` map (via `nativeRoutes()`): Bun matches the pattern directly, and
 * the compiled handler self-extracts `params` / `wildcardParams` from the
 * URL. This removes the `fetch` fallback hop for the common dynamic case.
 * - The `fetch` fallback (the `Bun.serve` fallback) still runs for unmatched,
 * loose-trailing-slash, and empty-param-trailing-slash requests, consulting
 * the internal trie so behavior is fully preserved.
 *
 * Both paths execute exactly the same compiled handler, so method dispatch,
 * 405+Allow, auto-HEAD, and lifecycle behavior are identical. The native table
 * is consumed only by the Bun adapter; non-Bun (WinterCG) adapters dispatch
 * every route through `fetch` + trie (see ).
 */
export class Router {
    private staticMap = new StaticMap();
    private trie = new Trie();
    private allowCache = new AllowCache();
    private compiler: RouterCompiler;
    /** Dev mode: controls error-rendering detail (stack/cause in problem bodies). */
    private debug: boolean;
    /** Dynamic-dispatch engine preference ('auto' default). */
    private engine?: RouterConfig['engine'];
    /** Native dispatch table for `:param` / `*` routes (Bun `routes` map keys). */
    private nativeRoutesMap = new Map<string, CompiledHandler>();
    /** Retained compiled-route metadata (RouteAccessInfo + RouteMeta). */
    private compiledRoutes?: Map<string, CompiledRoute>;
    /** Memoized `staticRoutes()` result; rebuilt on `compile()`. */
    private cachedStaticRoutes?: Record<string, CompiledHandler>;
    /** Pre-routing hooks (Plugin + Global scope). Run before routing in `fetch()`. */
    private onRequestHooks: Hook[] = [];
    /** App-level providers, bound onto the single per-request context. */
    private appProviders?: Map<string, unknown>;
    /**
     * RegExp matcher for dynamic/wildcard routes (WinterCG fast path).
     * Built when the engine setting allows and compilation succeeds;
     * `null` means dispatch stays on the trie.
     */
    private regexMatcher: ((path: string) => RegexMatch | null) | null = null;

    constructor(config: RouterConfig = {}) {
        this.debug = config.debug ?? false;
        this.engine = config.engine;
        this.compiler = new RouterCompiler(
            config.debug,
            config.validation ?? {},
            config.jit !== false
        );
    }

    /**
     * Compiles a `RouteDefinition[]` into the dispatch structures.
     * Replaces all tables wholesale (no incremental merge) so hot reload
     * cannot leak stale routes.
     */
    compile(
        defs: import('../types/index.js').RouteDefinition[],
        plugins?: ResolvedPlugin[],
        providers?: Map<string, unknown>,
        onRequestHooks?: Hook[]
    ): void {
        const result = this.compiler.compile(
            defs,
            plugins,
            providers,
            this.onRequestHooks.length
        );
        this.staticMap = result.staticMap;
        this.trie = result.trie;
        this.allowCache = result.allowCache;
        this.nativeRoutesMap = result.nativeRoutes;
        this.compiledRoutes = result.routes;
        this.cachedStaticRoutes = undefined;
        this.onRequestHooks = onRequestHooks ?? [];
        this.appProviders = providers;
        this.regexMatcher = this.buildMatcher(result);
    }

    /**
     * Builds the RegExp dispatch matcher for dynamic/wildcard routes when
     * the configured engine asks for it ('regex'). Benchmarks showed the
     * radix trie equal-or-faster on fallback dispatch (single-route parity,
     * ~2% trie edge at 241 routes), so 'auto' stays on the trie and the
     * matcher is an explicit opt-in.
     */
    private buildMatcher(result: {
        trie: Trie;
        routes?: Map<string, CompiledRoute>;
        nativeRoutes: Map<string, CompiledHandler>;
    }): ((path: string) => RegexMatch | null) | null {
        if (this.engine !== 'regex') return null;
        if (!result.routes || result.routes.size === 0) return null;

        const entries: RegexRouteEntry[] = [];
        for (const [path, compiled] of result.routes) {
            if (!isDynamicPath(path)) continue;
            entries.push({
                path,
                handler: compiled.handler,
                methods: new Set(
                    Object.keys(compiled.def.handlers).map((m) =>
                        m.toUpperCase()
                    )
                ),
                isWildcard:
                    compiled.def.isWildcard === true || path.includes('*'),
            });
        }
        // The trie is compiled in the same pass — its DFS order is the
        // authoritative alternative order.
        const built = buildRegexMatcher(entries, result.trie.orderedPatterns());
        if (!built) return null; // trie fallback applies
        return built;
    }

    /**
     * Read-only access to the retained compiled-route metadata
     * (`RouteAccessInfo` + `RouteMeta`). Populated by `compile()`; not used on
     * the request hot path, so it has no runtime performance impact.
     */
    getCompiledRoutes(): Map<string, CompiledRoute> | undefined {
        return this.compiledRoutes;
    }

    /**
     * Returns the static routes as a `Bun.serve` `routes` map
     * (`path → compiled handler`).
     *
     * Bun's native routing invokes each handler with ONLY `(request)`, so the
     * matched-route metadata cannot be passed as a second argument the way the
     * trie-dispatched (dynamic/wildcard) routes are in `fetch`. To guarantee
     * `req.route` is available for **every** matched route.
     * each static handler is wrapped to inject `ctxInit` with its `route`
     * identity (`path` === `pattern` for static routes). This preserves Bun's
     * native dispatch fast path — no router redesign, no perf regression.
     */
    staticRoutes(): Record<string, CompiledHandler> {
        if (this.cachedStaticRoutes) return this.cachedStaticRoutes;
        const out: Record<string, CompiledHandler> = {};
        const hasOnRequest = this.onRequestHooks.length > 0;
        for (const [path, handler] of this.staticMap.entries()) {
            out[path] = this.wrapHandler(handler, hasOnRequest, {
                path,
                pattern: path,
            });
        }
        this.cachedStaticRoutes = out;
        return out;
    }

    nativeRoutes(): Record<string, CompiledHandler> {
        const out: Record<string, CompiledHandler> = {};
        const hasOnRequest = this.onRequestHooks.length > 0;
        for (const [pattern, handler] of this.nativeRoutesMap.entries()) {
            out[pattern] = this.wrapHandler(handler, hasOnRequest, undefined);
        }
        return out;
    }

    private wrapHandler(
        handler: CompiledHandler,
        hasOnRequest: boolean,
        route: { path: string; pattern: string } | undefined
    ): CompiledHandler {
        return async (
            request: Request,
            ctxInit?: ContextInit,
            prebuilt?: BurgerContext,
            env?: import('../context/context.js').BurgerEnv,
            executionCtx?: import('../context/context.js').BurgerExecutionContext
        ) => {
            let outcome: OnRequestOutcome | undefined;
            if (hasOnRequest) {
                outcome = await this.runOnRequest(request, env, executionCtx);
                if (outcome.shortCircuit) return outcome.shortCircuit;
            }
            try {
                const result = route
                    ? await handler(
                          request,
                          { ...ctxInit, route },
                          prebuilt ?? outcome?.ctx,
                          env,
                          executionCtx
                      )
                    : await handler(
                          request,
                          undefined,
                          undefined,
                          env,
                          executionCtx
                      );
                const mappers = outcome?.mappers;
                return mappers && mappers.length > 0
                    ? this.applyMappers(result, mappers)
                    : result;
            } catch (error) {
                return renderHTTPError(error, this.debug);
            }
        };
    }

    /**
     * Compatibility alias for `staticRoutes()`.
     */
    get routes(): Record<string, CompiledHandler> {
        return this.staticRoutes();
    }

    /**
     * Executes pre-routing `onRequest` hooks on a minimal BurgerContext.
     * Returns a Response if any hook short-circuits, or undefined to continue.
     * Platform `env` / `executionCtx` are bound onto the context here so they
     * survive into the dispatched handler via re-binding.
     */
    private async runOnRequest(
        request: Request,
        env?: import('../context/context.js').BurgerEnv,
        executionCtx?: import('../context/context.js').BurgerExecutionContext
    ): Promise<OnRequestOutcome> {
        // ONE context per request: created here (before routing) so
        // onRequest hooks can seed state that survives into the handler.
        // The dispatched route binds this instance to its matched route.
        const ctx = BurgerContext.create(
            request,
            undefined,
            undefined,
            this.appProviders,
            undefined,
            env,
            executionCtx
        );
        const outcome: OnRequestOutcome = {
            shortCircuit: undefined,
            mappers: [],
            ctx,
        };
        if (this.onRequestHooks.length === 0) return outcome;
        for (const hook of this.onRequestHooks) {
            try {
                const result = await (hook as (ctx: BurgerContext) => unknown)(
                    ctx
                );
                if (result instanceof Response) {
                    outcome.shortCircuit = result;
                    return outcome;
                }
                if (typeof result === 'function') {
                    outcome.mappers.push(
                        result as (
                            res: Response
                        ) => Response | Promise<Response>
                    );
                }
            } catch (error) {
                outcome.shortCircuit = renderHTTPError(error, this.debug);
                return outcome;
            }
        }
        return outcome;
    }

    private async applyMappers(
        response: Response,
        mappers: ((res: Response) => Response | Promise<Response>)[]
    ): Promise<Response> {
        let res = response;
        for (const mapper of mappers) {
            res = await mapper(res);
        }
        return res;
    }

    /**
     * The `fetch` fallback handed to `Bun.serve`.
     * Handles dynamic/wildcard routes via the trie, and resolves
     * loose-trailing-slash static variants that Bun did not match directly.
     *
     * `env` / `executionCtx` are optional platform bindings forwarded from
     * the serving entry point (WinterCG `fetch(request, env, ctx)`). The
     * signature is intentionally its own shape — NOT the server-oriented
     * `FetchHandler` — so the platform slots stay unambiguous.
     */
    fetch: (
        request: Request,
        env?: import('../context/context.js').BurgerEnv,
        executionCtx?: import('../context/context.js').BurgerExecutionContext
    ) => Promise<Response> = async (
        request: Request,
        env?: import('../context/context.js').BurgerEnv,
        executionCtx?: import('../context/context.js').BurgerExecutionContext
    ): Promise<Response> => {
        // Pre-routing: create minimal context and run onRequest hooks.
        // Any hook returning a Response short-circuits the entire pipeline.
        // Mapper functions are collected and applied to the eventual response.
        const outcome = await this.runOnRequest(request, env, executionCtx);
        if (outcome.shortCircuit) return outcome.shortCircuit;
        const apply =
            outcome.mappers.length > 0
                ? (res: Response) => this.applyMappers(res, outcome.mappers)
                : (res: Response) => res;
        const raw = extractPathnameFromUrl(request.url);
        // Collapse repeated slashes but PRESERVE a single trailing slash so that
        // `:param` routes can capture an empty value (e.g. `/users/` → `:id === ""`).
        const path = raw.replace(/\/+/g, '/');

        // 1. Exact static route (slash-preserving — Bun already serves the exact
        // form natively; this catches the trailing-slash variants it missed).
        const staticExact = this.staticMap.get(path);
        if (staticExact) {
            // Every matched route gets a `ctxInit` with `route`; static routes
            // have no params/wildcardParams.
            const ctxInit: ContextInit = { route: { path, pattern: path } };
            return apply(
                await staticExact(request, ctxInit, outcome.ctx, env, executionCtx)
            );
        }

        // 2. Dynamic / wildcard routes: the RegExp matcher first (when
        // compiled), then the radix trie. Both produce identical match
        // shapes (params, wildcard segments, methods) — verified by the
        // parity test suite.
        let dynamicMatch:
            | RegexMatch
            | import('./trie.js').TrieMatch
            | null = null;
        if (this.regexMatcher) {
            dynamicMatch = this.regexMatcher(path);
        }
        if (!dynamicMatch) {
            dynamicMatch = this.trie.match(path);
        }
        const match = dynamicMatch;
        if (match) {
            // Auto-HEAD: a GET route implies HEAD is allowed.
            const method = request.method;
            const headAllowed = method === 'HEAD' && match.methods.has('GET');
            if (!match.methods.has(method) && !headAllowed) {
                const allow =
                    this.allowCache.get(path) ?? [...match.methods].join(', ');
                return methodNotAllowed(allow);
            }

            // Seed `ctxInit`: `route` is always present; `params` /
            // `wildcardParams` are added only when the route has them.
            const ctxInit: ContextInit = {
                route: { path, pattern: match.pattern },
                params: match.params,
                wildcardParams: match.wildcardParams,
            };
            return apply(
                await match.handler(request, ctxInit, outcome.ctx, env, executionCtx)
            );
        }

        // 3. Loose trailing-slash fallback for static routes: `/foo/` ≡ `/foo`.
        const normalized = normalizePath(raw);
        if (normalized !== path) {
            const loose =
                this.staticMap.get(normalized) ??
                this.staticMap.get(normalized + '/');
            if (loose) {
                const ctxInit: ContextInit = {
                    route: { path: normalized, pattern: normalized },
                };
                return apply(
                    await loose(request, ctxInit, outcome.ctx, env, executionCtx)
                );
            }
        }

        return apply(notFound());
    };
}

/**
 * A route path is dynamic when it carries a `:param` or `*` segment —
 * the set dispatched through the trie / RegExp matcher.
 */
function isDynamicPath(path: string): boolean {
    return path.includes(':') || path.includes('*');
}
