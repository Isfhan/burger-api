import { renderUncaught } from '../errors/http-error.js';
import { dispatchOnError } from '../lifecycle/executor.js';
import type { ContextInit } from '../context/types.js';
import {
    applySet,
    notFound,
    methodNotAllowed,
} from '../utils/response.js';
import { extractPathnameFromUrl } from '../utils/wildcard.js';
import { isThenable } from '../utils/thenable.js';
import { RouterCompiler, buildGlobalResponsePlan } from './compiler.js';
import {
    hasGlobalResponseHooks,
    runGlobalResponseHooks,
} from '../lifecycle/executor.js';
import type { GlobalResponsePlan } from '../lifecycle/executor.js';
import { resolveDebug } from '../utils/env.js';
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
import type { ErrorHook, Hook, RouteHooks } from '../lifecycle/types.js';
import type { Scope } from '../chain/node.js';
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
     * THE per-request context, created here so `onRequest` hooks can seed
     * state (request IDs, counters, …) that survives into the handler —
     * the dispatched route binds this same instance, not a second context.
     */
    ctx: BurgerContext;
}

/**
 * Public router: owns the compiled dispatch state and orchestrates lookup
 * and execution.
 *
 * Static, dynamic (`:param`), and wildcard (`*`) routes are all registered
 * on Bun's native `routes` map; compiled handlers self-extract `params` /
 * `wildcardParams`. The `fetch` fallback still runs for unmatched and
 * trailing-slash requests (`/foo/` ≡ `/foo`), consulting the internal trie.
 *
 * Both paths execute the same compiled handler, so method dispatch,
 * 405+Allow, auto-HEAD, and lifecycle behavior are identical. Non-Bun
 * (WinterCG) adapters dispatch every route through `fetch` + trie.
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
    /**
     * Error hooks available before a route is matched (Global → Plugin →
     * Framework, nearest-first). Let pre-routing `onRequest` throws go
     * through the same `onError` pipeline as request errors.
     */
    private onErrorHooks: ErrorHook[] = [];
    /**
     * Global/plugin response hooks (afterRoute + mapResponse) for responses
     * with no matched route plan: 404/405/auto-OPTIONS, pages/assets/docs,
     * and onError-rendered errors. Compiled once at startup.
     */
    private globalResponsePlan: GlobalResponsePlan = {
        afterRoute: [],
        mapResponse: [],
    };
    /** Hot-path flag: true when the global response plan has hooks. */
    private globalResponseActive = false;
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
        // Resolve once: `debug: true` or NODE_ENV=development. The compiler
        // (hook plans) and renderUnhandled share this exact value, so
        // onRequest errors and handler errors render the same.
        this.debug = resolveDebug(config.debug);
        this.engine = config.engine;
        this.compiler = new RouterCompiler(
            this.debug,
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
        this.onErrorHooks = buildPreRoutingErrorChain(plugins, globalHooks);
        this.globalResponsePlan = buildGlobalResponsePlan(plugins, globalHooks);
        this.globalResponseActive = hasGlobalResponseHooks(
            this.globalResponsePlan
        );
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
     * The app services resolved ONCE at compile time. Non-API contexts
     * (dynamic pages) receive the same shared object so `ctx.services` is
     * populated there too.
     */
    getAppServices(): BurgerServices {
        return this.appServices;
    }

    /**
     * Builds the RegExp dispatch matcher for dynamic/wildcard routes when
     * the configured engine asks for it ('regex'). 'auto' stays on the trie,
     * so the matcher is an explicit opt-in.
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
     * Each method is specialized at compile time; methods not present fall
     * through to `fetch`, which answers 405 + Allow for known paths.
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
     * Exact static API paths as direct dispatchers, keyed by path.
     * `fetchHandler()` merges these into its page/asset lookup so a static
     * API request resolves in one `Map.get` instead of a page-map miss plus
     * a `StaticMap` hit. Each dispatcher mirrors the `fetch` fallback for its
     * own path: known method → specialized core, otherwise the compiled
     * method-dispatch handler (405 + Allow), with global response hooks and
     * the `onRequest` pipeline applied exactly as `fetchWithPath` does.
     */
    staticDispatchMap(): Map<string, CompiledHandler> {
        const out = new Map<string, CompiledHandler>();
        for (const path of this.staticMap.keys()) {
            out.set(path, this.buildStaticDispatch(path));
        }
        return out;
    }

    private buildStaticDispatch(path: string): CompiledHandler {
        // Hook path: reuse the router's own pre-routing pipeline. The path is
        // exact, so no slash handling is skipped.
        if (this.hasOnRequest) {
            return (request, _ctxInit, _prebuilt, env, executionCtx) =>
                this.dispatchWithOnRequest(request, env, executionCtx, path);
        }
        const entry = this.staticMap.getEntry(path)!;
        // A known method runs its core — the core already carries the global
        // response plan. Only the method-dispatch fallback (405 + Allow) is a
        // non-route response, so only it gets `finishNonRouteResponse` —
        // exactly the split `dispatchMatched` uses.
        const finishFallback = this.globalResponseActive;
        return (
            request: Request,
            _ctxInit?: ContextInit,
            _prebuilt?: BurgerContext,
            env?: BurgerEnv,
            executionCtx?: BurgerExecutionContext
        ): Response | Promise<Response> => {
            const core = entry.cores?.[request.method as HTTPMethod];
            if (core) {
                return core(request, undefined, undefined, env, executionCtx);
            }
            const response = entry.handler(
                request,
                undefined,
                undefined,
                env,
                executionCtx
            );
            return finishFallback
                ? this.finishNonRouteResponse(
                      response,
                      request,
                      undefined,
                      env,
                      executionCtx
                  )
                : response;
        };
    }

    /**
     * Builds the Bun method object for one compiled path. Without hooks each
     * method forwards straight to the compiled core; with hooks each method
     * runs onRequest once before the core and binds the resulting context
     * onto the route.
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
        if (this.onRequestHooks.length === 0 && !this.globalResponseActive) {
            return handler;
        }
        const inner = handler as unknown as (
            request: Request,
            ...args: unknown[]
        ) => unknown;
        const wrapped = async (
            request: Request,
            _serverOrCtxInit?: unknown,
            prebuilt?: BurgerContext,
            env?: BurgerEnv,
            executionCtx?: BurgerExecutionContext
        ): Promise<Response> => {
            const outcome = await this.runOnRequest(request, env, executionCtx);
            if (outcome.shortCircuit) return outcome.shortCircuit;
            // The onRequest context is handed to the handler so pages bind
            // it (one context per request) and ctx.set survives.
            const ctx = prebuilt ?? outcome.ctx;
            try {
                const result = (await inner(
                    request,
                    undefined,
                    ctx,
                    env,
                    executionCtx
                )) as Response;
                const finished = await this.finishNonRouteResponse(
                    result,
                    request,
                    ctx,
                    env,
                    executionCtx
                );
                return outcome.mappers.length > 0
                    ? this.applyMappers(finished, outcome.mappers)
                    : finished;
            } catch (error) {
                const rendered = this.renderUnhandled(request, error);
                const finished = await this.finishNonRouteResponse(
                    rendered,
                    request,
                    ctx,
                    env,
                    executionCtx
                );
                return outcome.mappers.length > 0
                    ? this.applyMappers(finished, outcome.mappers)
                    : finished;
            }
        };
        return wrapped as unknown as T;
    }

    /** Renders an error that escaped the pipeline; logs it when 5xx. */
    private renderUnhandled(request: Request, error: unknown): Response {
        return renderUncaught(error, request, this.debug);
    }

    /**
     * Applies the global/plugin response plan and `ctx.set` to a response
     * that did not run a route plan (404/405/OPTIONS, pages/assets/docs,
     * onError renders). Returns the response unchanged — zero cost — when
     * neither applies.
     */
    private finishNonRouteResponse(
        response: Response | Promise<Response>,
        request: Request,
        prebuilt: BurgerContext | undefined,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): Response | Promise<Response> {
        if (!this.globalResponseActive && prebuilt?.hasSet() !== true) {
            return response;
        }
        return isThenable(response)
            ? response.then((res) =>
                  this.applyGlobalResponseHooks(
                      res,
                      request,
                      prebuilt,
                      env,
                      executionCtx
                  )
              )
            : this.applyGlobalResponseHooks(
                  response,
                  request,
                  prebuilt,
                  env,
                  executionCtx
              );
    }

    /** Runs the global response plan, then `ctx.set`, for one response. */
    private async applyGlobalResponseHooks(
        response: Response,
        request: Request,
        prebuilt: BurgerContext | undefined,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): Promise<Response> {
        const ctx =
            prebuilt ??
            BurgerContext.create(
                request,
                undefined,
                undefined,
                this.appServices,
                undefined,
                env,
                executionCtx,
                this.ipHolder
            );
        let res = response;
        if (this.globalResponseActive) {
            try {
                res = await runGlobalResponseHooks(
                    this.globalResponsePlan,
                    ctx,
                    res
                );
            } catch (error) {
                // A failing response hook renders through the same onError
                // chain as request errors instead of rejecting.
                res = await dispatchOnError(
                    error,
                    this.onErrorHooks,
                    ctx,
                    this.debug
                );
            }
        }
        return ctx.hasSet() ? applySet(res, ctx.set) : res;
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
                    // Global/plugin response hooks and ctx.set apply to the
                    // short-circuit too; mappers from earlier hooks still
                    // wrap it (e.g. cors() then rateLimit(): the 429 keeps
                    // CORS headers) — same contract as beforeRoute.
                    outcome.shortCircuit = await this.applyMappers(
                        await this.finishNonRouteResponse(
                            result,
                            request,
                            ctx,
                            env,
                            executionCtx
                        ),
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
                // Same onError chain as request errors (nearest-first:
                // Global → Plugin → Framework) — never a bare render. The
                // rendered error also gets the global response hooks.
                outcome.shortCircuit = await this.applyMappers(
                    await this.finishNonRouteResponse(
                        await dispatchOnError(
                            error,
                            this.onErrorHooks,
                            ctx,
                            this.debug
                        ),
                        request,
                        ctx,
                        env,
                        executionCtx
                    ),
                    outcome.mappers
                );
                return outcome;
            }
        }
        return outcome;
    }

    /**
     * Dynamic / wildcard lookup: the RegExp matcher first (when compiled),
     * then the radix trie. Both produce identical match shapes. A match that
     * binds a `:param` to an empty segment is rejected. Apps with no dynamic
     * routes skip both matchers.
     */
    private matchDynamic(
        path: string
    ): RegexMatch | import('./trie.js').TrieMatch | null {
        if (!this.regexMatcher && this.nativeRoutesMap.size === 0) return null;
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
     * The `fetch` fallback handed to `Bun.serve`: dynamic/wildcard routes
     * via the trie, plus loose-trailing-slash static variants Bun did not
     * match directly.
     *
     * `env` / `executionCtx` are optional platform bindings (WinterCG
     * `fetch(request, env, ctx)`). The signature is its own shape — NOT the
     * server-oriented `FetchHandler` — so the platform slots stay unambiguous.
     * Sync-first: a synchronously resolved executor returns a `Response`
     * directly; only hook plans and async handlers produce a Promise.
     */
    fetch: (
        request: Request,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ) => Response | Promise<Response> = (
        request: Request,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): Response | Promise<Response> =>
        this.hasOnRequest
            ? this.dispatchWithOnRequest(request, env, executionCtx, undefined)
            : this.dispatchMatched(
                  request,
                  extractPathnameFromUrl(request.url),
                  undefined,
                  undefined,
                  env,
                  executionCtx
              );

    /**
     * `fetch` with a pathname the caller already extracted (e.g.
     * `fetchHandler()` resolved page/asset routes first), avoiding a second
     * URL parse per request. The pathname must come from
     * `extractPathnameFromUrl`.
     */
    fetchWithPath: (
        request: Request,
        pathname: string,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ) => Response | Promise<Response> = (
        request: Request,
        pathname: string,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): Response | Promise<Response> =>
        this.hasOnRequest
            ? this.dispatchWithOnRequest(request, env, executionCtx, pathname)
            : this.dispatchMatched(
                  request,
                  pathname,
                  undefined,
                  undefined,
                  env,
                  executionCtx
              );

    /** Pre-routing hook path: context + mappers wrap the matched dispatch. */
    private async dispatchWithOnRequest(
        request: Request,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext,
        precomputedPath?: string
    ): Promise<Response> {
        // Pre-routing: create the one context and run onRequest hooks. A hook
        // returning a Response short-circuits the pipeline; mapper functions
        // are collected and applied to the eventual response.
        const outcome = await this.runOnRequest(request, env, executionCtx);
        if (outcome.shortCircuit) return outcome.shortCircuit;
        const mappers = outcome.mappers;
        const apply =
            mappers.length > 0
                ? (res: Response) => this.applyMappers(res, mappers)
                : undefined;
        const path = precomputedPath ?? extractPathnameFromUrl(request.url);
        return this.dispatchMatched(
            request,
            path,
            outcome.ctx,
            apply,
            env,
            executionCtx
        );
    }

    /**
     * Routing + execution against the compiled tables. `prebuilt` is the
     * pre-routing context (onRequest path) or `undefined`; `apply` wraps the
     * response in collected onRequest mappers when any exist.
     */
    private dispatchMatched(
        request: Request,
        raw: string,
        prebuilt: BurgerContext | undefined,
        apply: ((res: Response) => Response | Promise<Response>) | undefined,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): Response | Promise<Response> {
        // Collapse repeated slashes but PRESERVE a single trailing slash (the
        // exact form is tried first; the slash-less form is the fallback).
        // The regex runs only when the path actually carries `//`.
        const path = raw.indexOf('//') === -1 ? raw : raw.replace(/\/+/g, '/');

        // 1. Exact static route (slash-preserving — Bun already serves the exact
        // form natively; this catches the trailing-slash variants it missed).
        const staticEntry = this.staticMap.getEntry(path);
        if (staticEntry) {
            // No ctxInit: the compiled executor seeds the route identity from
            // its own frozen static route meta (no per-request allocation).
            // A known method dispatches straight to its specialized core
            // (skips the method-dispatch wrapper); an unknown method falls
            // through to the wrapper's 405 + Allow.
            const core = staticEntry.cores?.[request.method as HTTPMethod];
            const response = core
                ? core(request, undefined, prebuilt, env, executionCtx)
                : this.finishNonRouteResponse(
                      staticEntry.handler(
                          request,
                          undefined,
                          prebuilt,
                          env,
                          executionCtx
                      ),
                      request,
                      prebuilt,
                      env,
                      executionCtx
                  );
            return apply === undefined
                ? response
                : applyToResponse(response, apply);
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
                this.staticMap.getEntry(normalized) ??
                this.staticMap.getEntry(normalized + '/');
            if (loose) {
                const ctxInit: ContextInit = {
                    route: { path: normalized, pattern: normalized },
                };
                const core = loose.cores?.[request.method as HTTPMethod];
                const response = core
                    ? core(request, ctxInit, prebuilt, env, executionCtx)
                    : this.finishNonRouteResponse(
                          loose.handler(
                              request,
                              ctxInit,
                              prebuilt,
                              env,
                              executionCtx
                          ),
                          request,
                          prebuilt,
                          env,
                          executionCtx
                      );
                return apply === undefined
                    ? response
                    : applyToResponse(response, apply);
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
                const notAllowed = this.finishNonRouteResponse(
                    methodNotAllowed(allow),
                    request,
                    prebuilt,
                    env,
                    executionCtx
                );
                return apply === undefined
                    ? notAllowed
                    : applyToResponse(notAllowed, apply);
            }

            // Seed `ctxInit`: `route` is always present; `params` /
            // `wildcardParams` are added only when the route has them.
            const ctxInit: ContextInit = {
                route: { path: routePath, pattern: match.pattern },
                params: match.params,
                wildcardParams: match.wildcardParams,
            };
            const response = match.handler(
                request,
                ctxInit,
                prebuilt,
                env,
                executionCtx
            );
            return apply === undefined
                ? response
                : applyToResponse(response, apply);
        }

        const notFoundResponse = this.finishNonRouteResponse(
            notFound(),
            request,
            prebuilt,
            env,
            executionCtx
        );
        return apply === undefined
            ? notFoundResponse
            : applyToResponse(notFoundResponse, apply);
    }
}

/** Applies collected onRequest mappers to a sync or async response. */
function applyToResponse(
    response: Response | Promise<Response>,
    apply: (res: Response) => Response | Promise<Response>
): Response | Promise<Response> {
    return isThenable(response) ? response.then(apply) : apply(response);
}

/**
 * Builds the pre-routing `onError` chain: the hooks available before a route
 * is matched, in the same nearest-first order a route plan uses (Global →
 * Plugin → Framework).
 */
function buildPreRoutingErrorChain(
    plugins?: ResolvedPlugin[],
    globalHooks?: RouteHooks
): ErrorHook[] {
    const buckets: Record<Scope, ErrorHook[]> = {
        local: [],
        global: [],
        plugin: [],
        framework: [],
    };
    const push = (value: ErrorHook | ErrorHook[] | undefined, to: ErrorHook[]) => {
        if (value === undefined) return;
        if (Array.isArray(value)) for (const h of value) to.push(h);
        else to.push(value);
    };
    push(globalHooks?.onError, buckets.global);
    for (const plugin of plugins ?? []) {
        push(plugin.hooks.onError, buckets[plugin.scope]);
    }
    return [
        ...buckets.global,
        ...buckets.plugin,
        ...buckets.framework,
    ];
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
