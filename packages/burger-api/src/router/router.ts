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

/**
 * Public router that owns the compiled dispatch state and orchestrates
 * lookup + execution (Option A — Hybrid Router).
 *
 * - Static routes are served by Bun's native `routes` map (via `staticRoutes()`).
 * - Dynamic / wildcard routes are served by `fetch` (the `Bun.serve` fallback),
 *   which consults the internal trie.
 *
 * Both paths execute exactly the same compiled handler, so method dispatch,
 * 405+Allow, auto-HEAD, and middleware behavior are identical. Lookup and
 * execution are separate concerns (see ROADMAP-phase1.md §4.1).
 */
export class Router {
    private staticMap = new StaticMap();
    private trie = new Trie();
    private allowCache = new AllowCache();
    private compiler: RouterCompiler;
    /** Retained compiled-route metadata (RouteAccessInfo + RouteMeta). */
    private compiledRoutes?: Map<string, CompiledRoute>;
    /** Memoized `staticRoutes()` result; rebuilt on `compile()`. */
    private cachedStaticRoutes?: Record<string, CompiledHandler>;

    constructor(config: RouterConfig = {}) {
        this.compiler = new RouterCompiler(
            config.globalMiddleware ?? [],
            config.debug ?? false,
            config.validation ?? {}
        );
    }

    /**
     * Compiles a `RouteDefinition[]` into the dispatch structures.
     * Replaces all tables wholesale (no incremental merge) so hot reload
     * cannot leak stale routes.
     */
    compile(defs: import('../types/index').RouteDefinition[]): void {
        const result = this.compiler.compile(defs);
        this.staticMap = result.staticMap;
        this.trie = result.trie;
        this.allowCache = result.allowCache;
        this.compiledRoutes = result.routes;
        this.cachedStaticRoutes = undefined;
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
     * `req.route` is available for **every** matched route (ROADMAP-phase2 §5.7),
     * each static handler is wrapped to inject `ctxInit` with its `route`
     * identity (`path` === `pattern` for static routes). This preserves Bun's
     * native dispatch fast path — no router redesign, no perf regression.
     */
    staticRoutes(): Record<string, CompiledHandler> {
        if (this.cachedStaticRoutes) return this.cachedStaticRoutes;
        const out: Record<string, CompiledHandler> = {};
        for (const [path, handler] of this.staticMap.entries()) {
            out[path] = (request: Request) =>
                handler(request, { route: { path, pattern: path } });
        }
        this.cachedStaticRoutes = out;
        return out;
    }

    /**
     * Compatibility alias for `staticRoutes()`.
     */
    get routes(): Record<string, CompiledHandler> {
        return this.staticRoutes();
    }

    /**
     * The `fetch` fallback handed to `Bun.serve`.
     * Handles dynamic/wildcard routes via the trie, and resolves
     * loose-trailing-slash static variants that Bun did not match directly.
     */
    fetch: FetchHandler = async (request: Request): Promise<Response> => {
        const raw = extractPathnameFromUrl(request.url);
        // Collapse repeated slashes but PRESERVE a single trailing slash so that
        // `:param` routes can capture an empty value (e.g. `/users/` → `:id === ""`).
        const path = raw.replace(/\/+/g, '/');

        // 1. Exact static route (slash-preserving — Bun already serves the exact
        //    form natively; this catches the trailing-slash variants it missed).
        const staticExact = this.staticMap.get(path);
        if (staticExact) {
            // Every matched route gets a `ctxInit` with `route`; static routes
            // have no params/wildcardParams.
            const ctxInit: ContextInit = { route: { path, pattern: path } };
            return staticExact(request, ctxInit);
        }

        // 2. Dynamic / wildcard routes via the internal trie. The trie is
        //    consulted before the loose-slash static fallback so that a trailing
        //    slash resolving to an empty `:param` value wins (matching Bun).
        const match = this.trie.match(path);
        if (match) {
            // Auto-HEAD: a GET route implies HEAD is allowed.
            const method = request.method;
            const headAllowed = method === 'HEAD' && match.methods.has('GET');
            if (!match.methods.has(method) && !headAllowed) {
                const allow =
                    this.allowCache.get(path) ??
                    [...match.methods].join(', ');
                return methodNotAllowed(allow);
            }

            // Seed `ctxInit`: `route` is always present; `params` /
            // `wildcardParams` are added only when the route has them.
            const ctxInit: ContextInit = {
                route: { path, pattern: match.pattern },
                params: match.params,
                wildcardParams: match.wildcardParams,
            };
            return match.handler(request, ctxInit);
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
                return loose(request, ctxInit);
            }
        }

        return NOT_FOUND;
    };
}
