import { renderHTTPError } from '../errors/http-error';
import type { FetchHandler } from '../types/index';
import type { ContextInit } from '../context/types';
import { NOT_FOUND, methodNotAllowed } from '../utils/response';
import { normalizePath } from '../utils/index';
import { extractPathnameFromUrl } from '../utils/wildcard';
import { RouterCompiler } from './compiler';
import { AllowCache } from './allow-cache';
import { StaticMap } from './static-map';
import { Trie } from './trie';
import type { CompiledHandler, CompiledRoute, RouterConfig } from './types';
import type { ValidatorConfig } from '../validation/types';
import type { ResolvedPlugin } from '../plugin/types';
import type { Hook } from '../lifecycle/types';
import { BurgerContext } from '../context/context';

interface OnRequestOutcome {
    shortCircuit: Response | undefined;
    mappers: ((res: Response) => Response | Promise<Response>)[];
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
    /** Native dispatch table for `:param` / `*` routes (Bun `routes` map keys). */
    private nativeRoutesMap = new Map<string, CompiledHandler>();
    /** Retained compiled-route metadata (RouteAccessInfo + RouteMeta). */
    private compiledRoutes?: Map<string, CompiledRoute>;
    /** Memoized `staticRoutes()` result; rebuilt on `compile()`. */
    private cachedStaticRoutes?: Record<string, CompiledHandler>;
    /** Pre-routing hooks (Plugin + Global scope). Run before routing in `fetch()`. */
    private onRequestHooks: Hook[] = [];

    constructor(config: RouterConfig = {}) {
        this.compiler = new RouterCompiler(
            config.debug ?? false,
            config.validation ?? {}
        );
    }

    /**
     * Compiles a `RouteDefinition[]` into the dispatch structures.
     * Replaces all tables wholesale (no incremental merge) so hot reload
     * cannot leak stale routes.
     */
    compile(
        defs: import('../types/index').RouteDefinition[],
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
        return async (request: Request, ctxInit?: any) => {
            let outcome: OnRequestOutcome = {
                shortCircuit: undefined,
                mappers: [],
            };
            if (hasOnRequest) {
                outcome = await this.runOnRequest(request);
                if (outcome.shortCircuit) return outcome.shortCircuit;
            }
            try {
                const result = route
                    ? await handler(request, { ...ctxInit, route })
                    : await handler(request);
                return outcome.mappers.length > 0
                    ? this.applyMappers(result, outcome.mappers)
                    : result;
            } catch (error) {
                return renderHTTPError(error, false);
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
     */
    private async runOnRequest(request: Request): Promise<OnRequestOutcome> {
        const outcome: OnRequestOutcome = {
            shortCircuit: undefined,
            mappers: [],
        };
        if (this.onRequestHooks.length === 0) return outcome;
        const ctx = BurgerContext.create(request);
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
                outcome.shortCircuit = renderHTTPError(error, false);
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
     */
    fetch: FetchHandler = async (request: Request): Promise<Response> => {
        // Pre-routing: create minimal context and run onRequest hooks.
        // Any hook returning a Response short-circuits the entire pipeline.
        // Mapper functions are collected and applied to the eventual response.
        const outcome = await this.runOnRequest(request);
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
            return apply(await staticExact(request, ctxInit));
        }

        // 2. Dynamic / wildcard routes via the internal trie. The trie is
        // consulted before the loose-slash static fallback so that a trailing
        // slash resolving to an empty `:param` value wins (matching Bun).
        const match = this.trie.match(path);
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
            return apply(await match.handler(request, ctxInit));
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
                return apply(await loose(request, ctxInit));
            }
        }

        return apply(NOT_FOUND);
    };
}
