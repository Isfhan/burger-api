import type { FetchHandler, BurgerRequest } from '../types/index';
import { NOT_FOUND, methodNotAllowed } from '../utils/response';
import { normalizePath } from '../utils/index';
import { extractPathnameFromUrl } from '../utils/wildcard';
import { RouterCompiler } from './compiler';
import { AllowCache } from './allow-cache';
import { StaticMap } from './static-map';
import { Trie } from './trie';
import type { CompiledHandler, RouterConfig } from './types';

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

    constructor(config: RouterConfig = {}) {
        this.compiler = new RouterCompiler(config.globalMiddleware ?? []);
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
    }

    /**
     * Returns the static routes as a `Bun.serve` `routes` map
     * (`path → compiled handler`).
     */
    staticRoutes(): Record<string, CompiledHandler> {
        const out: Record<string, CompiledHandler> = {};
        for (const [path, handler] of this.staticMap.entries()) {
            out[path] = handler;
        }
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
            return staticExact(request as BurgerRequest);
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

            const burgerReq = request as BurgerRequest;
            if (match.params && Object.keys(match.params).length > 0) {
                burgerReq.params = match.params;
            }
            if (match.isWildcard) {
                burgerReq.wildcardParams = match.wildcardParams ?? [];
            }

            return match.handler(burgerReq);
        }

        // 3. Loose trailing-slash fallback for static routes: `/foo/` ≡ `/foo`.
        const normalized = normalizePath(raw);
        if (normalized !== path) {
            const loose =
                this.staticMap.get(normalized) ??
                this.staticMap.get(normalized + '/');
            if (loose) {
                return loose(request as BurgerRequest);
            }
        }

        return NOT_FOUND;
    };
}
