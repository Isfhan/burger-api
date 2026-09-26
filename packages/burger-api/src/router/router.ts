import { renderHTTPError, logUnhandledError } from '../errors/http-error.js';
import type { ContextInit } from '../context/types.js';
import { notFound, methodNotAllowed } from '../utils/response.js';
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
import type {
    CompiledHandler,
    CompiledRoute,
    NativeMethodCores,
    NativeMethodHandler,
    NativeMethodHandlers,
    RouterConfig,
} from './types.js';
import type { ValidatorConfig } from '../validation/types.js';
import type { ResolvedPlugin } from '../plugin/types.js';
import type { Hook } from '../lifecycle/types.js';
import type {
    BurgerEnv,
    BurgerExecutionContext,
    BurgerServices,
    RequestIPHolder,
} from '../context/context.js';
import {
    BurgerContext,
    EMPTY_SERVICES,
    createServices,
    isRequestIPSource,
} from '../context/context.js';
import type { HTTPMethod } from '../utils/routing.js';

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
 * and trailing-slash requests (`/foo/` ≡ `/foo`), consulting
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
    /** Per-path per-method specialized executors (fed to Bun method objects). */
    private methodCores = new Map<string, NativeMethodCores>();
    /** Retained compiled-route metadata (RouteAccessInfo + RouteMeta). */
    private compiledRoutes?: Map<string, CompiledRoute>;
    /** Memoized `staticRoutes()` result; rebuilt on `compile()`. */
    private cachedStaticRoutes?: Record<string, NativeMethodHandlers>;
    /** Memoized `nativeRoutes()` result; rebuilt on `compile()`. */
    private cachedNativeRoutes?: Record<string, NativeMethodHandlers>;
    /** Pre-routing hooks (Plugin + Global scope). Run before routing in `fetch()`. */
    private onRequestHooks: Hook[] = [];
    /** True when pre-routing `onRequest` hooks exist (hot-path flag). */
    private hasOnRequest = false;
    /** App services resolved ONCE; shared (frozen) by every request context. */
    private appServices: BurgerServices = EMPTY_SERVICES;
    /** Per-app server reference for lazy `ctx.ip` (written once at startup). */
    private ipHolder: RequestIPHolder = {};
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
        onRequestHooks?: Hook[],
        globalHooks?: import('../lifecycle/types.js').RouteHooks
    ): void {
        // Services are resolved once here (shared with the compiled handlers,
        // which receive the already-built object).
        this.appServices = createServices(providers);
        const result = this.compiler.compile(
            defs,
            plugins,
            this.appServices,
            onRequestHooks?.length ?? 0,
            globalHooks,
            this.ipHolder
        );
        this.staticMap = result.staticMap;
        this.trie = result.trie;
        this.allowCache = result.allowCache;
        this.nativeRoutesMap = result.nativeRoutes;
        this.methodCores = result.methodCores;
        this.compiledRoutes = result.routes;
        this.cachedStaticRoutes = undefined;
        this.cachedNativeRoutes = undefined;
        this.onRequestHooks = onRequestHooks ?? [];
        this.hasOnRequest = this.onRequestHooks.length > 0;
        this.regexMatcher = this.buildMatcher(result);
    }

    /**
     * Records the serving runtime's handle (Bun's `Server`) once so `ctx.ip`
     * can resolve the socket peer lazily — no per-request WeakMap write.
     * Adapter-facing; called at startup by the Bun serve path.
     */
    setRequestIPSource(server: unknown): void {
        if (isRequestIPSource(server)) {
            this.ipHolder.server = server;
        }
    }

    /**
     * The per-app `ctx.ip` holder. Non-API contexts (dynamic pages) receive it
     * so their `ctx.ip` resolves exactly like API routes.
     */
    getRequestIPHolder(): RequestIPHolder {
        return this.ipHolder;
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
     * Returns the static routes as a `Bun.serve` `routes` map: one **method
     * object** per path (`{ GET: fnGet, POST: fnPost, HEAD: fnHead, ... }`).
     * Each method is specialized at compile time (handler + hook plan baked
     * in); Bun invokes it with `(request, server)` and its already-decoded
     * `request.params`. Methods not present in the object fall through to
     * `fetch`, which answers 405 + Allow for known paths.
     */
    staticRoutes(): Record<string, NativeMethodHandlers> {
        if (this.cachedStaticRoutes) return this.cachedStaticRoutes;
        const out: Record<string, NativeMethodHandlers> = {};
        for (const [path] of this.staticMap.entries()) {
            out[path] = this.buildMethods(path);
        }
        this.cachedStaticRoutes = out;
        return out;
    }

    /**
     * Same method-object shape for `:param` / `*` routes: Bun matches the
     * pattern natively and passes decoded `request.params`, so no URL
     * re-parsing happens on the hot path.
     */
    nativeRoutes(): Record<string, NativeMethodHandlers> {
        if (this.cachedNativeRoutes) return this.cachedNativeRoutes;
        const out: Record<string, NativeMethodHandlers> = {};
        for (const pattern of this.nativeRoutesMap.keys()) {
            out[pattern] = this.buildMethods(pattern);
        }
        this.cachedNativeRoutes = out;
        return out;
    }

    /**
     * Builds the Bun method object for one compiled path. Without hooks each
     * method is a thin adapter over the compiled core (Bun calls native
     * handlers with `(request, server)`; only `request` is forwarded). With
     * hooks each method runs onRequest exactly once before the core and binds
     * the resulting context onto the route.
     */
    private buildMethods(path: string): NativeMethodHandlers {
        const cores = this.methodCores.get(path)!;
        const out: NativeMethodHandlers = {};
        if (!this.hasOnRequest) {
            for (const key of Object.keys(cores) as HTTPMethod[]) {
                const core = cores[key]!;
                out[key] = (request) => core(request);
            }
            return out;
        }
        for (const key of Object.keys(cores) as HTTPMethod[]) {
            const core = cores[key]!;
            const wrapped: NativeMethodHandler = async (request) => {
                const outcome = await this.runOnRequest(request);
                if (outcome.shortCircuit) return outcome.shortCircuit;
                try {
                    // The onRequest context is bound by the route, so state
                    // seeded pre-routing survives (one context per request).
                    const result = await core(request, undefined, outcome.ctx);
                    return outcome.mappers.length > 0
                        ? this.applyMappers(result, outcome.mappers)
                        : result;
                } catch (error) {
                    return this.renderUnhandled(request, error);
                }
            };
            out[key] = wrapped;
        }
        return out;
    }

    /**
     * Wraps a non-API handler registered on the native routes map (pages,
     * static assets, `/openapi.json`, `/docs`) so global/plugin `onRequest`
     * hooks (CORS, logging, auth, rate limiting) apply to it exactly like
     * API routes. Returned unchanged when no `onRequest` hooks exist.
     */
    wrapWithOnRequest<T extends (request: Request) => unknown>(handler: T): T {
        if (this.onRequestHooks.length === 0) return handler;
        const wrapped = async (
            request: Request,
            _serverOrCtxInit?: unknown,
            _prebuilt?: BurgerContext,
            env?: BurgerEnv,
            executionCtx?: BurgerExecutionContext
        ): Promise<Response> => {
            const outcome = await this.runOnRequest(request, env, executionCtx);
            if (outcome.shortCircuit) return outcome.shortCircuit;
            try {
                const result = (await handler(request)) as Response;
                return outcome.mappers.length > 0
                    ? this.applyMappers(result, outcome.mappers)
                    : result;
            } catch (error) {
                return this.renderUnhandled(request, error);
            }
        };
        return wrapped as unknown as T;
    }

    /** Renders an error that escaped the pipeline; logs it when 5xx. */
    private renderUnhandled(request: Request, error: unknown): Response {
        const response = renderHTTPError(error, this.debug);
        if (response.status >= 500) {
            logUnhandledError(request.method, request.url, error);
        }
        return response;
    }

    /**
     * Compatibility alias for `staticRoutes()`.
     */
    get routes(): Record<string, NativeMethodHandlers> {
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
            this.appServices,
            undefined,
            env,
            executionCtx,
            this.ipHolder
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
                    // Mappers from earlier hooks still wrap the short-circuit
                    // (e.g. cors() then rateLimit(): the 429 keeps CORS
                    // headers) — same contract as beforeRoute.
                    outcome.shortCircuit = await this.applyMappers(
                        result,
                        outcome.mappers
                    );
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
                outcome.shortCircuit = await this.applyMappers(
                    this.renderUnhandled(request, error),
                    outcome.mappers
                );
                return outcome;
            }
        }
        return outcome;
    }

    /**
     * Dynamic / wildcard lookup: the RegExp matcher first (when compiled),
     * then the radix trie. Both produce identical match shapes (params,
     * wildcard segments, methods) — verified by the parity test suite.
     * A match that binds a `:param` to an empty segment is rejected.
     */
    private matchDynamic(
        path: string
    ): RegexMatch | import('./trie.js').TrieMatch | null {
        let match: RegexMatch | import('./trie.js').TrieMatch | null = null;
        if (this.regexMatcher) match = this.regexMatcher(path);
        if (!match) match = this.trie.match(path);
        if (match && hasEmptyParam(match.params)) return null;
        return match;
    }

    /**
     * Applies collected after-mappers in onion order (last registered runs
     * first, the first hook's mapper wraps outermost) — identical to
     * `runHooks` and the JIT for beforeRoute.
     */
    private async applyMappers(
        response: Response,
        mappers: ((res: Response) => Response | Promise<Response>)[]
    ): Promise<Response> {
        let res = response;
        for (let i = mappers.length - 1; i >= 0; i--) {
            res = await mappers[i]!(res);
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
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ) => Promise<Response> = async (
        request: Request,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): Promise<Response> => {
        // Pre-routing: create the one context and run onRequest hooks. Any
        // hook returning a Response short-circuits the entire pipeline;
        // mapper functions are collected and applied to the eventual
        // response. With no hooks, nothing is allocated before a match is
        // known (the matched route creates its own context).
        let outcome: OnRequestOutcome | undefined;
        if (this.hasOnRequest) {
            outcome = await this.runOnRequest(request, env, executionCtx);
            if (outcome.shortCircuit) return outcome.shortCircuit;
        }
        const mappers = outcome?.mappers;
        const apply =
            mappers && mappers.length > 0
                ? (res: Response) => this.applyMappers(res, mappers)
                : undefined;
        const prebuilt = outcome?.ctx;

        const raw = extractPathnameFromUrl(request.url);
        // Collapse repeated slashes but PRESERVE a single trailing slash (the
        // exact form is tried first; the slash-less form is the fallback).
        // The regex runs only when the path actually carries `//`.
        const path = raw.indexOf('//') === -1 ? raw : raw.replace(/\/+/g, '/');

        // 1. Exact static route (slash-preserving — Bun already serves the exact
        // form natively; this catches the trailing-slash variants it missed).
        const staticExact = this.staticMap.get(path);
        if (staticExact) {
            // Every matched route gets a `ctxInit` with `route`; static routes
            // have no params/wildcardParams.
            const ctxInit: ContextInit = { route: { path, pattern: path } };
            const response = await staticExact(
                request,
                ctxInit,
                prebuilt,
                env,
                executionCtx
            );
            return apply ? apply(response) : response;
        }

        // 2. Dynamic / wildcard routes (see matchDynamic). A `:param` never
        // matches an empty segment (`/users/` is not `/users/:id` with id "");
        // a trailing slash is retried without it, so `/users/1/` ≡ `/users/1`.
        let routePath = path;
        let match = this.matchDynamic(path);
        if (!match && path.length > 1 && path.endsWith('/')) {
            // 3. Loose trailing-slash fallback: `/foo/` ≡ `/foo`.
            // `path` is already slash-collapsed, so stripping the trailing
            // slash is exactly `normalizePath(raw)`.
            const normalized = path.slice(0, -1);
            const loose =
                this.staticMap.get(normalized) ??
                this.staticMap.get(normalized + '/');
            if (loose) {
                const ctxInit: ContextInit = {
                    route: { path: normalized, pattern: normalized },
                };
                const response = await loose(
                    request,
                    ctxInit,
                    prebuilt,
                    env,
                    executionCtx
                );
                return apply ? apply(response) : response;
            }
            match = this.matchDynamic(normalized);
            routePath = normalized;
        }
        if (match) {
            // Auto-HEAD: a GET route implies HEAD is allowed.
            const method = request.method;
            const headAllowed = method === 'HEAD' && match.methods.has('GET');
            if (!match.methods.has(method) && !headAllowed) {
                const allow =
                    this.allowCache.get(match.pattern) ??
                    [...match.methods].join(', ');
                return methodNotAllowed(allow);
            }

            // Seed `ctxInit`: `route` is always present; `params` /
            // `wildcardParams` are added only when the route has them.
            const ctxInit: ContextInit = {
                route: { path: routePath, pattern: match.pattern },
                params: match.params,
                wildcardParams: match.wildcardParams,
            };
            const response = await match.handler(
                request,
                ctxInit,
                prebuilt,
                env,
                executionCtx
            );
            return apply ? apply(response) : response;
        }

        const notFoundResponse = notFound();
        return apply ? apply(notFoundResponse) : notFoundResponse;
    };
}

/** True when any matched `:param` captured an empty segment. */
function hasEmptyParam(params: Record<string, string> | undefined): boolean {
    if (!params) return false;
    for (const k in params) if (params[k] === '') return true;
    return false;
}

/**
 * A route path is dynamic when it carries a `:param` or `*` segment —
 * the set dispatched through the trie / RegExp matcher.
 */
function isDynamicPath(path: string): boolean {
    return path.includes(':') || path.includes('*');
}
