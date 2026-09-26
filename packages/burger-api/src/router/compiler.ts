import type { RouteDefinition, RequestHandler } from '../types/index.js';
import type { HTTPMethod } from '../utils/routing.js';
import type { RouteModule } from '../compiler/route-module.js';
import type {
    ContextInit,
    RouteAccessInfo,
    RouteMeta,
} from '../context/types.js';
import { compileRouteSchema } from '../validation/compiler.js';
import { createValidationHook } from '../validation/validator.js';
import {
    methodNotAllowed,
    applySet,
    createAutoOptionsHandler,
} from '../utils/response.js';
import { HTTPError } from '../errors/http-error.js';
import {
    dispatchOnError,
    executeHookPlanForHandler,
} from '../lifecycle/executor.js';
import { compileJitHookPlan } from '../lifecycle/jit.js';
import type { HookPlan, RouteHooks, TransformMap } from '../lifecycle/types.js';
import { HookChain } from '../chain/chain.js';
import { flatten } from '../chain/flattener.js';
import { composePluginHooks } from '../plugin/composer.js';
import type { ResolvedPlugin } from '../plugin/types.js';
import {
    BurgerContext,
    createServices,
} from '../context/context.js';
import type {
    BurgerEnv,
    BurgerExecutionContext,
    BurgerServices,
    RequestIPHolder,
} from '../context/context.js';
import { analyzeRouteAccess } from '../analysis/route-access-analyzer.js';
import { AllowCache } from './allow-cache.js';
import { StaticMap } from './static-map.js';
import { Trie } from './trie.js';
import { ROUTE_CONSTANTS } from '../utils/routing.js';
import { extractCtxInit } from './param-extract.js';
import type {
    CompiledHandler,
    CompiledRouter,
    CompiledRoute,
    NativeMethodCores,
    RouteCore,
} from './types.js';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../validation/types.js';

/**
 * Compiles a `RouteDefinition[]` into the dispatch structures used by `Router`.
 *
 * Responsibilities:
 * - Build the optimized `CompiledHandler` per route (method dispatch + 405/Allow
 * + auto-HEAD + hook pipeline delegation).
 * - Classify each route as static (→ `StaticMap`) or dynamic/wildcard (→ `Trie`).
 * - Populate the `AllowCache`.
 * - Optionally run the `RouteAccessAnalyzer` once per route (compile-time only;
 * its output is baked into `meta` but never read at runtime ).
 * - Fail fast on duplicate or ambiguous routes (compile-time error).
 * - Optionally register constant `OPTIONS` responses via `Bun.nativeStaticResponse`.
 */
export class RouterCompiler {
    private debug?: boolean;
    private config: ValidatorConfig;
    /** JIT HookPlan compilation (capability-gated, default off). */
    private jit: boolean;

    constructor(
        debug?: boolean,
        config: ValidatorConfig = {},
        jit = false
    ) {
        this.debug = debug;
        this.config = config;
        this.jit = jit;
    }

    compile(
        defs: RouteDefinition[],
        plugins?: ResolvedPlugin[],
        providers?: Map<string, unknown> | BurgerServices,
        onRequestHooksCount: number = 0,
        globalHooks?: RouteHooks,
        ipHolder?: RequestIPHolder
    ): CompiledRouter {
        const staticMap = new StaticMap();
        const trie = new Trie();
        const allowCache = new AllowCache();
        // Native dispatch table: `:param` / `*` routes keyed by their Bun-native
        // pattern (e.g. `/users/:id`). These are handed to Bun's `routes` map so
        // dynamic routes dispatch without the `fetch` fallback hop. The compiled
        // handler self-extracts params (see param-extract.ts), so behavior is
        // identical to the trie path. The trie is retained for the `fetch`
        // fallback (unmatched / loose-slash / empty-param trailing slash).
        const nativeRoutes = new Map<string, CompiledHandler>();
        // Per-route per-method specialized executors (fed to Bun method
        // objects by the Router).
        const methodCores = new Map<string, NativeMethodCores>();
        const registeredPaths = new Set<string>();
        // Retained metadata per route (RouteAccessInfo + RouteMeta). Build-time
        // only; never read on the request hot path.
        const compiledRoutes = new Map<string, CompiledRoute>();
        // App services resolved ONCE — shared (frozen) by every request.
        const services = createServices(providers);

        for (const def of defs) {
            const path = def.path;

            // Allow header: the route's explicitly defined methods (HEAD is not
            // listed unless the user defined it — auto-HEAD is derived, not advertised).
            const allowMethods = Object.keys(def.handlers).filter(
                (m) => m !== 'HEAD'
            );
            const allow = allowCache.compute(allowMethods);
            allowCache.set(path, allow);

            // Every handler is checked to return a `Response`. Every route
            // also answers OPTIONS: when none is declared the framework adds
            // one (204 + Allow) that skips beforeRoute, so auth hooks never
            // reject CORS preflights (onRequest still runs).
            //
            // `rawHandlers` keeps the user function; `handlers` wraps it with
            // the Response check for the hook pipeline. The empty-plan direct
            // path performs the check inline instead (same error path).
            const rawHandlers: Partial<Record<HTTPMethod, RequestHandler>> = {};
            const handlers: Partial<Record<HTTPMethod, RequestHandler>> = {};
            for (const m of Object.keys(def.handlers) as HTTPMethod[]) {
                const h = def.handlers[m];
                if (typeof h !== 'function') continue;
                rawHandlers[m] = h;
                handlers[m] = (h as { isAutoOptions?: boolean }).isAutoOptions
                    ? h
                    : requireResponse(h, m, path);
            }
            if (!handlers.OPTIONS) {
                const autoOptions = createAutoOptionsHandler([
                    ...allowMethods,
                    'OPTIONS',
                ]);
                rawHandlers.OPTIONS = autoOptions as unknown as RequestHandler;
                handlers.OPTIONS = autoOptions as unknown as RequestHandler;
            }

            const hasSchema = !!def.schema;
            let routeValidators:
                | import('../validation/types.js').CompiledRouteValidators
                | undefined;

            // Compose the frozen `HookPlan` once at compile time.
            // The HookChain collects ChainNodes tagged with scope + owner; the
            // flattener produces the per-hook-point arrays with correct ordering
            // (global → local for forward hooks, local → global for onError).
            // Validation is added as global scope so it pins at index 0.
            const routeHooks = def.hooks;
            const chain = new HookChain();
            if (hasSchema) {
                const validators = compileRouteSchema(def.schema!, this.config);
                chain.add({
                    stage: 'validation',
                    fn: createValidationHook(
                        validators,
                        this.config,
                        this.debug === true
                    ),
                    scope: 'global',
                    owner: 'framework',
                });
                routeValidators = validators;
            }
            // App-level hooks (`src/hooks.ts` / `globalHooks`) are staged with
            // scope 'global' and route hooks with scope 'local', so the
            // flattener owns the ordering: request hooks run
            // Plugin → Global → Route, response + error hooks run
            // Route → Global → Plugin (nearest-first). Declared order is kept
            // within a scope. User arrays are never mutated.
            addHookStages(chain, globalHooks, 'global', 'app');
            addHookStages(chain, routeHooks, 'local', path);

            // compose plugin hooks into the chain.
            // Plugin hooks are scoped (plugin by default) and the flattener
            // orders them between global (validation) and local (route).
            if (plugins) {
                composePluginHooks(chain, plugins, path);
            }

            const plan = flatten(chain, path);
            // Merge transform from plugins, global hooks and route hooks (in
            // that precedence order — route wins on key collision).
            plan.transform = mergeTransformRecords(
                routeHooks?.transform,
                plugins,
                globalHooks?.transform
            );

            // Attach compiled validators for response validation post-handler.
            if (routeValidators) {
                plan.validators = routeValidators;
            }

            // Thread debug flag for error rendering.
            plan.debug = this.debug;

            // Thread global validation config for response validation. A
            // route's `config.ts` may override `responseValidation`.
            const routeMode = def.config?.responseValidation;
            plan.validatorConfig =
                routeMode === 'off' ||
                routeMode === 'dev' ||
                routeMode === 'enforce'
                    ? { ...this.config, responseValidation: routeMode }
                    : this.config;

            // Optional, compile-time-only route field analysis. The result is
            // baked into `meta` but is unused at runtime, so it can
            // never affect request correctness.
            const meta: RouteAccessInfo = analyzeRouteAccess(def, this.debug);

            const isWildcard = def.isWildcard === true;
            const isStatic = isStaticPath(path);
            const cores = buildRouteCores(
                rawHandlers,
                handlers,
                plan,
                meta,
                path,
                isWildcard,
                isStatic,
                def.config,
                this.jit,
                services,
                ipHolder
            );
            methodCores.set(path, cores);
            // The `fetch` fallback (trie / loose-slash / undefined method)
            // dispatches through the same specialized per-method functions.
            const compiled = buildFallbackHandler(cores, allow);

            // Retain compiled-route metadata (RouteAccessInfo + RouteMeta).
            // When a schema exists, also retain the precompiled validators so
            // the validation orchestrator runs them at request time.
            compiledRoutes.set(path, {
                def: { ...def, handlers },
                handler: compiled,
                methods: allowMethods,
                allow,
                route: { path, pattern: path },
                meta,
                validators: routeValidators,
            });

            if (isStatic) {
                if (registeredPaths.has(path)) {
                    throw new Error(
                        `Duplicate static route registered: "${path}". ` +
                            `Each path may be defined by exactly one route.ts.`
                    );
                }
                registeredPaths.add(path);
                staticMap.set(path, compiled);

                // Optional: cache provably-constant OPTIONS responses natively.
                // (Loose trailing-slash equivalence is resolved at lookup time in
                // Router.fetch, so it never shadows a `:param` empty-value match.)
                registerNativeOptions(
                    path,
                    { ...def, handlers },
                    hasSchema,
                    onRequestHooksCount
                );
            } else {
                if (registeredPaths.has(path)) {
                    throw new Error(
                        `Duplicate route registered: "${path}". ` +
                            `Each path may be defined by exactly one route.ts.`
                    );
                }
                registeredPaths.add(path);
                const methods = new Set(
                    Object.keys(handlers).map((m) => m.toUpperCase())
                );
                trie.insert(path, compiled, methods, isWildcard);
                // Register on Bun's native router (no `fetch` hop): the
                // specialized method handlers derive `params` from Bun's
                // `request.params` (or the URL when invoked directly).
                nativeRoutes.set(path, compiled);
            }
        }

        return {
            staticMap,
            trie,
            allowCache,
            nativeRoutes,
            methodCores,
            routes: compiledRoutes,
        };
    }

    /**
     * Compiles a `RouteModule[]` (the canonical output of the Module Loader)
     * into the dispatch structures. This is the compiler entry point
     * for the file-based discovery pipeline
     * (Directory Scanner → Module Loader → `RouteModule` → Compiler).
     *
     * Each `RouteModule` is normalized to the existing `RouteDefinition` shape
     * (the stable contract shared with the prod prebuilt path), then compiled
     * through {@link compile}. Convention data not yet compiled in * (`hooks`) is carried for downstream compilation. `config` is attached for runtime use.
     */
    compileModules(modules: RouteModule[]): CompiledRouter {
        return this.compile(modules.map(toRouteDefinition));
    }
}

/**
 * Normalizes a `RouteModule` (compiler's intermediate) into the existing
 * `RouteDefinition` (the normalized form between the compiler and the runtime).
 *
 * Convention data not yet compiled in (`hooks`) is carried on the
 * `RouteDefinition` for downstream compilation. `config` is attached for runtime use.
 */
function toRouteDefinition(mod: RouteModule): RouteDefinition {
    return {
        path: mod.path,
        handlers: mod.handlers,
        schema: mod.schema,
        openapi: mod.openapi,
        hooks: mod.hooks,
        isWildcard: mod.isWildcard,
        config: mod.config,
    };
}

/**
 * Normalizes a single hook value (function or array) into an array.
 * Generic so it works for both `Hook` and `ErrorHook`.
 */
function toHookArray<T>(h: T | T[] | undefined): T[] {
    if (h === undefined) return [];
    return Array.isArray(h) ? h : [h];
}

/** Stages one hook object's beforeRoute/afterRoute/mapResponse/onError. */
function addHookStages(
    chain: HookChain,
    hooks: RouteHooks | undefined,
    scope: 'global' | 'local',
    owner: string
): void {
    if (!hooks) return;
    chain.addStage('beforeRoute', toHookArray(hooks.beforeRoute), scope, owner);
    chain.addStage('afterRoute', toHookArray(hooks.afterRoute), scope, owner);
    chain.addStage('mapResponse', toHookArray(hooks.mapResponse), scope, owner);
    chain.addStage('onError', toHookArray(hooks.onError), scope, owner);
}

/**
 * Wraps a route handler so a non-`Response` return value fails loud with a
 * clear 500 (message visible in dev, generic in production, always logged)
 * instead of leaking to the runtime (Bun answers "Welcome to Bun!" 200).
 */
function requireResponse(
    handler: RequestHandler,
    method: string,
    path: string
): RequestHandler {
    const check = (result: unknown): Response => {
        if (result instanceof Response) return result;
        const kind =
            result === null
                ? 'null'
                : Array.isArray(result)
                  ? 'array'
                  : typeof result;
        throw new HTTPError(
            500,
            `${method} ${path} returned ${kind}; route handlers must return a Response`
        );
    };
    return (ctx: BurgerContext) => {
        const result: unknown = handler(ctx);
        return result instanceof Promise ? result.then(check) : check(result);
    };
}

/** Describes a non-Response handler return for the fail-loud 500 message. */
function describeReturn(result: unknown): string {
    return result === null
        ? 'null'
        : Array.isArray(result)
          ? 'array'
          : typeof result;
}

/**
 * Builds ONE specialized executor per route+method. Each executor creates (or
 * binds) the request context, runs the hook plan — or, for an empty plan,
 * calls the handler directly with no async wrapper — and merges `ctx.set`
 * into the response. Auto-HEAD (derived from GET) and the framework's auto
 * OPTIONS are baked in here, so the native path never probes at runtime.
 */
function buildRouteCores(
    rawHandlers: Partial<Record<HTTPMethod, RequestHandler>>,
    planHandlers: Partial<Record<HTTPMethod, RequestHandler>>,
    plan: HookPlan,
    meta: RouteAccessInfo,
    pattern: string,
    isWildcard: boolean,
    isStatic: boolean,
    config: Record<string, unknown> | undefined,
    jit: boolean,
    services: BurgerServices,
    ipHolder: RequestIPHolder | undefined
): NativeMethodCores {
    const cores: NativeMethodCores = {};
    // Static routes share one frozen route identity object; dynamic routes
    // carry only the pattern and derive `route.path` lazily on first access.
    const staticRouteMeta: RouteMeta | undefined = isStatic
        ? Object.freeze({ path: pattern, pattern })
        : undefined;

    for (const m of Object.keys(planHandlers) as HTTPMethod[]) {
        cores[m] = buildMethodCore(
            m,
            m,
            rawHandlers[m]!,
            planHandlers[m]!,
            plan,
            meta,
            pattern,
            isWildcard,
            staticRouteMeta,
            config,
            jit,
            services,
            ipHolder
        );
    }

    // Auto-HEAD: derive from GET when no explicit HEAD handler exists. The
    // GET handler runs through the normal plan; only the exit differs (body
    // stripped, Content-Length preserved) — see `finishHead`.
    if (!cores.HEAD && rawHandlers.GET) {
        cores.HEAD = buildMethodCore(
            'HEAD',
            'GET',
            rawHandlers.GET,
            planHandlers.GET!,
            plan,
            meta,
            pattern,
            isWildcard,
            staticRouteMeta,
            config,
            jit,
            services,
            ipHolder
        );
    }

    return cores;
}

/**
 * Builds one method's executor. The empty-plan path calls the handler
 * directly (`r instanceof Promise ? r.then(...) : ...`) with a synchronous
 * try/catch; the Response check and `ctx.set` merge happen in `settle`, and
 * a failure renders through the SAME `dispatchOnError` path the hook
 * pipeline uses.
 */
function buildMethodCore(
    method: HTTPMethod,
    errorMethod: string,
    rawHandler: RequestHandler,
    planHandler: RequestHandler,
    plan: HookPlan,
    meta: RouteAccessInfo,
    pattern: string,
    isWildcard: boolean,
    staticRouteMeta: RouteMeta | undefined,
    config: Record<string, unknown> | undefined,
    jit: boolean,
    services: BurgerServices,
    ipHolder: RequestIPHolder | undefined
): RouteCore {
    // The framework's auto OPTIONS answers directly: no beforeRoute (auth
    // hooks must not reject CORS preflights) and no context. onRequest hooks
    // (when configured) run in the router wrapper; their mappers still apply.
    if ((rawHandler as { isAutoOptions?: boolean }).isAutoOptions) {
        return () => (rawHandler as unknown as () => Response)();
    }

    const isHead = method === 'HEAD';
    // `isWildcard` may be unset on hand-built AOT definitions; the pattern is
    // authoritative (extractCtxInit always keyed off it too).
    const hasWildcard = isWildcard || pattern.includes('*');

    const resolveCtxInit = (request: Request): ContextInit => {
        if (staticRouteMeta) return { route: staticRouteMeta };
        // Wildcards are not exposed by Bun's `request.params`; the URL is
        // needed to split the captured segments.
        if (hasWildcard) return extractCtxInit(request, pattern, true);
        // Bun decodes `:param` values already; use its record directly (a
        // plain object with `Record<string,string>` semantics) and keep the
        // route identity lazy. Direct (non-Bun) invocations fall back to URL
        // extraction.
        const bunParams = (request as { params?: Record<string, string> })
            .params;
        return bunParams !== undefined
            ? { params: bunParams, pattern }
            : extractCtxInit(request, pattern, false);
    };

    const makeCtx = (
        request: Request,
        ctxInit: ContextInit | undefined,
        prebuilt: BurgerContext | undefined,
        env: BurgerEnv | undefined,
        executionCtx: BurgerExecutionContext | undefined
    ): BurgerContext => {
        const init = ctxInit ?? resolveCtxInit(request);
        // One context per request: bind the pre-routing instance (onRequest)
        // when present, otherwise allocate it here. `meta` is accepted but
        // ignored at runtime.
        return prebuilt
            ? prebuilt.bind(
                  request,
                  init,
                  meta,
                  undefined,
                  config,
                  env,
                  executionCtx,
                  ipHolder
              )
            : BurgerContext.create(
                  request,
                  init,
                  meta,
                  services,
                  config,
                  env,
                  executionCtx,
                  ipHolder
              );
    };

    const fail = (ctx: BurgerContext, error: unknown): Promise<Response> =>
        dispatchOnError(
            error,
            plan.onError,
            ctx,
            plan.debug,
            plan.validatorConfig
        );

    const finish = (ctx: BurgerContext, response: Response): Response =>
        ctx.hasSet() ? applySet(response, ctx.set) : response;

    /** Auto-HEAD exit: apply `ctx.set`, then strip the body, keeping size. */
    const finishHead = (mutated: Response): Response | Promise<Response> => {
        const headers = new Headers(mutated.headers);
        if (!headers.has('content-length') && mutated.body) {
            // Report GET's Content-Length: runtimes answer a null body with
            // `content-length: 0` unless the header is explicit.
            return mutated.arrayBuffer().then((buffer) => {
                headers.set('content-length', String(buffer.byteLength));
                return new Response(null, {
                    status: mutated.status,
                    statusText: mutated.statusText,
                    headers,
                });
            });
        }
        return new Response(null, {
            status: mutated.status,
            statusText: mutated.statusText,
            headers,
        });
    };

    const settle = (
        ctx: BurgerContext,
        result: unknown
    ): Response | Promise<Response> => {
        if (!(result instanceof Response)) {
            return fail(
                ctx,
                new HTTPError(
                    500,
                    `${errorMethod} ${pattern} returned ${describeReturn(
                        result
                    )}; route handlers must return a Response`
                )
            );
        }
        const mutated = finish(ctx, result);
        return isHead ? finishHead(mutated) : mutated;
    };

    const runDirect = (ctx: BurgerContext): Response | Promise<Response> => {
        try {
            const result: unknown = rawHandler(ctx);
            return result instanceof Promise
                ? result.then(
                      (value) => settle(ctx, value),
                      (error) => fail(ctx, error)
                  )
                : settle(ctx, result);
        } catch (error) {
            return fail(ctx, error);
        }
    };

    // JIT state: undefined = not yet attempted, null = unavailable, otherwise
    // the compiled dispatcher (lazily built on first hit so unused routes pay
    // no startup cost).
    let jitFn:
        | ((
              ctx: BurgerContext,
              handler: RequestHandler,
              method: string
          ) => Response | Promise<Response>)
        | null
        | undefined;
    const runPlan = (
        ctx: BurgerContext,
        handler: RequestHandler,
        request: Request
    ): Promise<Response> => {
        if (jit) {
            if (jitFn === undefined) {
                jitFn = compileJitHookPlan(plan, plan.debug);
            }
            const compiled = jitFn;
            if (compiled) {
                return Promise.resolve(compiled(ctx, handler, request.method));
            }
        }
        return executeHookPlanForHandler(ctx, plan, handler, request);
    };

    const hasPlanStages =
        plan.transform !== undefined ||
        plan.validation !== undefined ||
        plan.validators?.response !== undefined ||
        plan.beforeRoute.length > 0 ||
        plan.afterRoute.length > 0 ||
        plan.mapResponse.length > 0;

    // Empty plan: handler → finish/fail with no async wrapper when the
    // handler returns synchronously.
    if (!hasPlanStages) {
        return (request, ctxInit, prebuilt, env, executionCtx) =>
            runDirect(makeCtx(request, ctxInit, prebuilt, env, executionCtx));
    }

    // Validation-only plans: call the validator, await only if it returned a
    // promise (schemas without a body slot validate synchronously).
    if (
        plan.transform === undefined &&
        plan.validation !== undefined &&
        plan.validators?.response === undefined &&
        plan.beforeRoute.length === 0 &&
        plan.afterRoute.length === 0 &&
        plan.mapResponse.length === 0
    ) {
        const validation = plan.validation;
        return (request, ctxInit, prebuilt, env, executionCtx) => {
            const ctx = makeCtx(request, ctxInit, prebuilt, env, executionCtx);
            let outcome: ReturnType<typeof validation>;
            try {
                outcome = validation(ctx);
            } catch (error) {
                return fail(ctx, error);
            }
            return outcome instanceof Promise
                ? outcome.then(
                      () => runDirect(ctx),
                      (error) => fail(ctx, error)
                  )
                : runDirect(ctx);
        };
    }

    return (request, ctxInit, prebuilt, env, executionCtx) => {
        const ctx = makeCtx(request, ctxInit, prebuilt, env, executionCtx);
        return runPlan(ctx, planHandler, request).then((response) => {
            const mutated = finish(ctx, response);
            return isHead ? finishHead(mutated) : mutated;
        });
    };
}

/**
 * The `fetch`-facing dispatcher for one route: method lookup against the
 * precomputed specialized executors (auto-HEAD and auto-OPTIONS included),
 * otherwise 405 + Allow. The hook plan already ran inside the executor.
 */
function buildFallbackHandler(
    cores: NativeMethodCores,
    allow: string
): CompiledHandler {
    return async (request, ctxInit, prebuilt, env, executionCtx) => {
        const core = cores[request.method as HTTPMethod];
        if (!core) return methodNotAllowed(allow);
        return core(request, ctxInit, prebuilt, env, executionCtx);
    };
}

/**
 * Merges transform records from route hooks and plugins. Plugin transform records
 * are applied first, then route-level transform overrides on key collision.
 */
function mergeTransformRecords(
    routeTransform: TransformMap | undefined,
    plugins?: ResolvedPlugin[],
    globalTransform?: TransformMap
): TransformMap | undefined {
    const merged: TransformMap = {};
    if (plugins) {
        for (const p of plugins) {
            if (p.hooks.transform) {
                for (const k of Object.keys(p.hooks.transform)) {
                    merged[k] = p.hooks.transform[k]!;
                }
            }
        }
    }
    if (globalTransform) {
        for (const k of Object.keys(globalTransform)) {
            merged[k] = globalTransform[k]!;
        }
    }
    if (routeTransform) {
        for (const k of Object.keys(routeTransform)) {
            merged[k] = routeTransform[k]!;
        }
    }
    return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * A path is static when it contains no `:param` or `*` segment.
 */
function isStaticPath(path: string): boolean {
    return (
        !path.includes(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX) &&
        !path.includes(ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX)
    );
}

/**
 * Optionally registers a provably-constant `OPTIONS` (204) response via
 * `Bun.nativeStaticResponse`. Only safe when the route has no hooks,
 * no schema, and uses the framework's auto-generated OPTIONS handler — so the
 * response is identical for every request. The pipeline works correctly without
 * this; it is a pure performance optimization.
 */
function registerNativeOptions(
    path: string,
    def: RouteDefinition,
    hasSchema: boolean,
    onRequestHooksCount: number = 0
): void {
    // Skip native OPTIONS when onRequest hooks exist — they may need to
    // intercept OPTIONS preflight (e.g. CORS hook).
    if (onRequestHooksCount > 0) {
        return;
    }
    // Optional optimization: `Bun.nativeStaticResponse` may not exist in all
    // Bun versions, and `Bun` is undefined on non-Bun runtimes (WinterCG
    // targets). Detect both at runtime; the pipeline works without it.
    type NativeStaticResponse = (
        method: string,
        path: string,
        response: Response
    ) => void;
    const nativeStaticResponse = (
        typeof Bun === 'undefined'
            ? undefined
            : (Bun as { nativeStaticResponse?: NativeStaticResponse })
                  .nativeStaticResponse
    );
    if (typeof nativeStaticResponse !== 'function') {
        return;
    }
    if (hasSchema) {
        return;
    }
    const opt = def.handlers['OPTIONS'] as
        | (typeof def.handlers)['OPTIONS']
        | undefined;
    if (opt && (opt as { isAutoOptions?: boolean }).isAutoOptions === true) {
        try {
            nativeStaticResponse(
                'OPTIONS',
                path,
                new Response(null, {
                    status: 204,
                    headers: {
                        Allow:
                            (opt as { allowHeader?: string }).allowHeader ??
                            '',
                    },
                })
            );
        } catch {
            // Native static response not available for this path; the compiled
            // handler still serves OPTIONS correctly, so ignore.
        }
    }
}
