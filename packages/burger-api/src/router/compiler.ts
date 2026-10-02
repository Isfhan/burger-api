import type { RouteDefinition, RequestHandler } from '../types/index.js';
import type { HTTPMethod, LowercaseHTTPMethod } from '../utils/routing.js';
import { HTTP_METHODS } from '../utils/routing.js';
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
    globalErrorFinisher,
    hasGlobalResponseHooks,
    runGlobalResponseHooks,
} from '../lifecycle/executor.js';
import type { GlobalResponsePlan } from '../lifecycle/executor.js';
import { compileJitHookPlan } from '../lifecycle/jit.js';
import type {
    HookPlan,
    ResponseHook,
    RouteHooks,
    TransformMap,
} from '../lifecycle/types.js';
import { HookChain } from '../chain/chain.js';
import type { Scope } from '../chain/node.js';
import { flatten } from '../chain/flattener.js';
import { composePluginHooks } from '../plugin/composer.js';
import type { ResolvedPlugin } from '../plugin/types.js';
import { BurgerContext, createServices } from '../context/context.js';
import type {
    BurgerEnv,
    BurgerExecutionContext,
    BurgerServices,
    RequestIPHolder,
} from '../context/context.js';
import { analyzeRouteAccess } from '../analysis/route-access-analyzer.js';
import { assertTransformKeys } from '../lifecycle/transform.js';
import { isThenable } from '../utils/thenable.js';
import { AllowCache } from './allow-cache.js';
import { StaticMap } from './static-map.js';
import { Trie } from './trie.js';
import { ROUTE_CONSTANTS } from '../utils/routing.js';
import {
    compilePatternSegments,
    extractCtxInitWithSegments,
} from './param-extract.js';
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
 * Builds the global + plugin (+ framework) response plan, in the same
 * nearest-first order route plans use (global → plugin → framework; route
 * scope is excluded because it only runs for matched routes).
 */
export function buildGlobalResponsePlan(
    plugins?: ResolvedPlugin[],
    globalHooks?: RouteHooks
): GlobalResponsePlan {
    const after: Record<Scope, ResponseHook[]> = {
        local: [],
        global: [],
        plugin: [],
        framework: [],
    };
    const map: Record<Scope, ResponseHook[]> = {
        local: [],
        global: [],
        plugin: [],
        framework: [],
    };
    const push = (
        value: ResponseHook | ResponseHook[] | undefined,
        bucket: ResponseHook[]
    ): void => {
        if (value === undefined) return;
        if (Array.isArray(value)) {
            for (const hook of value) bucket.push(hook);
        } else {
            bucket.push(value);
        }
    };
    push(globalHooks?.afterRoute, after.global);
    push(globalHooks?.mapResponse, map.global);
    for (const plugin of plugins ?? []) {
        push(plugin.hooks.afterRoute, after[plugin.scope]);
        push(plugin.hooks.mapResponse, map[plugin.scope]);
    }
    return {
        afterRoute: [...after.global, ...after.plugin, ...after.framework],
        mapResponse: [...map.global, ...map.plugin, ...map.framework],
    };
}

/**
 * Compiles a `RouteDefinition[]` into the dispatch structures used by `Router`:
 * builds one `CompiledHandler` per route (method dispatch + 405/Allow +
 * auto-HEAD + hook pipeline), classifies routes as static (`StaticMap`) or
 * dynamic/wildcard (`Trie`), populates the `AllowCache`, optionally runs the
 * `RouteAccessAnalyzer` (compile-time only; its output is never read at
 * runtime), and fails fast on duplicate or ambiguous routes.
 */
export class RouterCompiler {
    private debug?: boolean;
    private config: ValidatorConfig;
    /** JIT HookPlan compilation (capability-gated, default off). */
    private jit: boolean;

    constructor(debug?: boolean, config: ValidatorConfig = {}, jit = false) {
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
        // Native dispatch table: `:param` / `*` routes keyed by their Bun
        // pattern (e.g. `/users/:id`). Handed to Bun's `routes` map so dynamic
        // routes skip the `fetch` fallback hop; the compiled handler
        // self-extracts params (see param-extract.ts). The trie is retained
        // for the `fetch` fallback (unmatched / loose-slash / empty param).
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
        // Plugin / app-level hook functions every route runs; the route-access
        // analyzer scans them alongside the route's own source (once per
        // compile pass).
        const accessSources = collectAccessSources(plugins, globalHooks);

        // Reserved transform keys fail startup, even for apps without routes.
        assertTransformKeys(globalHooks?.transform, 'global hooks');
        if (plugins) {
            for (const plugin of plugins) {
                assertTransformKeys(
                    plugin.hooks.transform,
                    `plugin "${plugin.name}"`
                );
            }
        }

        // Global/plugin response hooks for non-route responses (404/405/
        // auto-OPTIONS/errors); matched routes already carry them in `plan`.
        const globalResponse = buildGlobalResponsePlan(plugins, globalHooks);

        for (const def of defs) {
            const path = def.path;

            // Allow header: every method the route answers. HEAD is advertised
            // when GET exists (auto-HEAD) or was defined explicitly; OPTIONS is
            // always answered (auto OPTIONS), so it is always listed.
            const userMethods = Object.keys(def.handlers);
            const allowMethods = userMethods.filter((m) => m !== 'HEAD');
            const allowList: string[] = [];
            for (const m of allowMethods) {
                allowList.push(m);
                if (m === 'GET' && !userMethods.includes('HEAD')) {
                    allowList.push('HEAD');
                }
            }
            if (userMethods.includes('HEAD')) allowList.push('HEAD');
            if (!allowList.includes('OPTIONS')) allowList.push('OPTIONS');
            const allow = allowCache.compute(allowList);
            allowCache.set(path, allow);

            // Every handler is checked to return a `Response`. Every route
            // also answers OPTIONS: when none is declared the framework adds
            // one (204 + Allow) that skips beforeRoute, so auth hooks never
            // reject CORS preflights (onRequest still runs).
            //
            // `rawHandlers` keeps the user function; `handlers` wraps it with
            // the Response check for the hook pipeline.
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

            // Compose the frozen `HookPlan` once at compile time. The chain
            // collects nodes tagged with scope + owner; the flattener orders
            // the per-hook-point arrays (global → local for forward hooks,
            // local → global for onError). Validation is global scope, so it
            // pins at index 0.
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
            // App-level hooks (`src/hooks.ts` / `globalHooks`) stage with scope
            // 'global', route hooks with scope 'local'; the flattener owns the
            // ordering: request hooks run Plugin → Global → Route, response +
            // error hooks Route → Global → Plugin (nearest-first). Declared
            // order is kept within a scope; user arrays are never mutated.
            addHookStages(chain, globalHooks, 'global', 'app');
            addHookStages(chain, routeHooks, 'local', path);

            // Plugin hooks are scoped (plugin by default); the flattener orders
            // them between global (validation) and local (route).
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
            assertTransformKeys(plan.transform, `${path} transform`);
            // The error path needs the global hooks too; the plan already
            // carries them in afterRoute/mapResponse for the success path.
            if (hasGlobalResponseHooks(globalResponse)) {
                plan.globalResponse = globalResponse;
            }

            // Attach compiled validators for response validation post-handler.
            if (routeValidators) {
                plan.validators = routeValidators;
            }

            // Thread debug flag for error rendering.
            plan.debug = this.debug;

            // Split `config.ts` into route-wide options + per-method overrides
            // once; each method resolves its own merged config below. A
            // default-only config passes through with its identity intact.
            const { base: baseConfig, methods: methodConfigs } = splitConfig(
                def.config
            );

            // Thread global validation config for response validation. A
            // route's `config.ts` may override `responseValidation`; a
            // per-method override replaces it for that method only.
            plan.validatorConfig = resolveValidatorConfig(
                this.config,
                baseConfig
            );

            // Compile-time-only field analysis. A `known` result (every reader
            // provably accesses fields only through direct member reads) lets
            // the executor skip work for fields nothing reads; any doubt keeps
            // the conservative "all fields used" fallback, and `debug: true`
            // disables analysis entirely.
            const meta: RouteAccessInfo = analyzeRouteAccess(
                def,
                this.debug,
                accessSources
            );

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
                baseConfig,
                methodConfigs,
                this.config,
                this.jit,
                services,
                ipHolder,
                globalResponse
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
                staticMap.set(path, compiled, cores);

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
     * Compiles a `RouteModule[]` (the Module Loader's output) into the
     * dispatch structures — the compiler entry point for the file-based
     * pipeline (Scanner → Module Loader → `RouteModule` → Compiler).
     *
     * Each module is normalized to the `RouteDefinition` shape, then compiled
     * through {@link compile}.
     */
    compileModules(modules: RouteModule[]): CompiledRouter {
        return this.compile(modules.map(toRouteDefinition));
    }
}

/**
 * Normalizes a `RouteModule` (the compiler's intermediate) into the
 * `RouteDefinition` shape consumed by the runtime. Convention data
 * (`hooks`) is carried for downstream compilation; `config` is kept for
 * runtime use.
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
 * instead of leaking to the runtime.
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
 * Builds one specialized executor per route+method. Each creates (or binds)
 * the request context, runs the hook plan (or calls the handler directly for
 * an empty plan), and merges `ctx.set` into the response. Auto-HEAD and the
 * framework's auto OPTIONS are baked in here.
 *
 * `config` is the route-wide config; `methodConfigs` holds the per-method
 * overrides. Both are resolved to one merged object per method at compile
 * time — no per-request merging or allocation.
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
    methodConfigs: Record<string, Record<string, unknown>> | undefined,
    validatorBase: ValidatorConfig,
    jit: boolean,
    services: BurgerServices,
    ipHolder: RequestIPHolder | undefined,
    globalResponse: GlobalResponsePlan
): NativeMethodCores {
    const cores: NativeMethodCores = {};
    // Static routes share one frozen route identity object; dynamic routes
    // carry only the pattern and derive `route.path` lazily on first access.
    const staticRouteMeta: RouteMeta | undefined = isStatic
        ? Object.freeze({ path: pattern, pattern })
        : undefined;

    // When the analyzer proved nothing reads `ctx.validated` and a method
    // declares no validators, the empty `{}` bag is not allocated.
    const skipValidatedBag = meta.unknown === false && !meta.has('validated');

    for (const m of Object.keys(planHandlers) as HTTPMethod[]) {
        const methodConfig = mergeMethodConfig(
            config,
            methodConfigs?.[m.toLowerCase()]
        );
        cores[m] = buildMethodCore(
            m,
            m,
            rawHandlers[m]!,
            planHandlers[m]!,
            specializePlan(
                plan,
                m,
                skipValidatedBag,
                methodValidatorConfig(plan, validatorBase, methodConfig)
            ),
            meta,
            pattern,
            isWildcard,
            staticRouteMeta,
            methodConfig,
            jit,
            services,
            ipHolder,
            globalResponse
        );
    }

    // Auto-HEAD: derive from GET when no explicit HEAD handler exists. The
    // GET handler runs through the normal plan and its response is returned as-is:
    // the server drops the body (and cancels a stream) for HEAD, so a body is
    // never read here. Config follows GET, mirroring the handler derivation.
    if (!cores.HEAD && rawHandlers.GET) {
        const headConfig = mergeMethodConfig(
            config,
            methodConfigs?.head ?? methodConfigs?.get
        );
        const headCore = buildMethodCore(
            'HEAD',
            'GET',
            rawHandlers.GET,
            planHandlers.GET!,
            specializePlan(
                plan,
                'HEAD',
                skipValidatedBag,
                methodValidatorConfig(plan, validatorBase, headConfig)
            ),
            meta,
            pattern,
            isWildcard,
            staticRouteMeta,
            headConfig,
            jit,
            services,
            ipHolder,
            globalResponse
        );
        cores.HEAD = (request, ctxInit, prebuilt, env, executionCtx) => {
            const result = headCore(
                request,
                ctxInit,
                prebuilt,
                env,
                executionCtx
            );
            return isThenable(result)
                ? (result as Promise<Response>).then(finishHead)
                : finishHead(result as Response);
        };
    }

    return cores;
}

/**
 * Auto-HEAD exit. The body is never read: the server drops it for HEAD (and
 * reports a buffered body's size). A handler-set Content-Length is kept by
 * sending headers only, since some servers drop it when the body is a stream.
 */
function finishHead(response: Response): Response {
    if (!response.body || !response.headers.has('content-length')) {
        return response;
    }
    void response.body.cancel().catch(() => {});
    return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

/**
 * Shallow-merges a method's config over the route-wide config (method keys
 * win). Returns the route-wide object unchanged when the method has no
 * override — preserving its identity for `ctx.config`.
 */
function mergeMethodConfig(
    base: Record<string, unknown> | undefined,
    override: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
    if (!override) return base;
    return { ...base, ...override };
}

/**
 * Resolves a method's effective `responseValidation` mode. Returns the base
 * plan's config object unchanged when the method does not change the mode, so
 * every core without an override shares the same ValidatorConfig.
 */
function methodValidatorConfig(
    plan: HookPlan,
    validatorBase: ValidatorConfig,
    methodConfig: Record<string, unknown> | undefined
): ValidatorConfig {
    const baseResolved =
        plan.validatorConfig ??
        resolveValidatorConfig(validatorBase, undefined);
    if (methodConfig === undefined) return baseResolved;
    const mode = methodConfig.responseValidation;
    if (mode !== 'off' && mode !== 'dev' && mode !== 'enforce') {
        return baseResolved;
    }
    return mode === baseResolved.responseValidation
        ? baseResolved
        : { ...validatorBase, responseValidation: mode };
}

/**
 * Applies a route config's `responseValidation` mode to the app validation
 * config; unknown/absent modes leave the base object untouched.
 */
function resolveValidatorConfig(
    base: ValidatorConfig,
    config: Record<string, unknown> | undefined
): ValidatorConfig {
    const mode = config?.responseValidation;
    return mode === 'off' || mode === 'dev' || mode === 'enforce'
        ? { ...base, responseValidation: mode }
        : base;
}

/** Route-wide config + per-method overrides split from `config.ts`. */
interface RouteConfigParts {
    base: Record<string, unknown> | undefined;
    methods: Record<string, Record<string, unknown>> | undefined;
}

/**
 * Splits a route's `config.ts` object into route-wide options and per-method
 * overrides (uppercase method keys only, lowercased here), so plain options
 * such as `options` or `delete` stay route-wide. A config without method
 * keys passes through untouched, preserving object identity.
 */
function splitConfig(
    config: Record<string, unknown> | undefined
): RouteConfigParts {
    if (!config) return { base: undefined, methods: undefined };
    let methods: Record<string, Record<string, unknown>> | undefined;
    for (const [key, value] of Object.entries(config)) {
        if (!isMethodKey(key)) continue;
        if (value === null || typeof value !== 'object') continue;
        (methods ??= {})[key.toLowerCase()] = value as Record<string, unknown>;
    }
    if (!methods) return { base: config, methods: undefined };

    const base: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
        if (isMethodKey(key)) continue;
        base[key] = value;
    }
    return { base, methods };
}

/** True when `key` is an uppercase HTTP method (`GET`, `POST`, …). */
function isMethodKey(key: string): boolean {
    return (HTTP_METHODS as readonly string[]).includes(key);
}

/**
 * Clones a route plan with the validation hook specialized for one method:
 * the method lookup and `toLowerCase()` are resolved at compile time, so the
 * request path runs only the declared slots. Plans without validators are
 * returned as-is (no allocation) unless the method's `responseValidation`
 * override changed the validator config.
 */
function specializePlan(
    plan: HookPlan,
    method: HTTPMethod,
    skipValidatedBag: boolean,
    validatorConfig: ValidatorConfig
): HookPlan {
    const validators = plan.validators;
    const configChanged = validatorConfig !== plan.validatorConfig;
    if (!validators || !plan.validation) {
        return configChanged ? { ...plan, validatorConfig } : plan;
    }

    // Response validation is resolved at compile time. 'off', and 'dev'
    // without debug output, do no observable work — dropping the validator
    // removes the per-request clone/parse entirely.
    const responseMode = validatorConfig.responseValidation ?? 'dev';
    const dropResponse =
        validators.response !== undefined &&
        (responseMode === 'off' ||
            (responseMode === 'dev' && plan.debug !== true));
    const planValidators = dropResponse
        ? omitResponseValidators(validators)
        : validators;

    return {
        ...plan,
        validation: createValidationHook(
            validators,
            plan.validatorConfig ?? {},
            plan.debug === true,
            method.toLowerCase() as import('../utils/routing.js').LowercaseHTTPMethod,
            skipValidatedBag
        ),
        validators: planValidators,
        validatorConfig,
    };
}

/** Shallow copy of the validators without the `response` map. */
function omitResponseValidators(
    validators: CompiledRouteValidators
): CompiledRouteValidators {
    const { response: _response, ...rest } = validators;
    return rest;
}

/**
 * Per-function access readers that are not part of the route definition but
 * still run for it: plugin hooks and app-level (`src/hooks.ts`) hooks plus
 * their transform factories. Used by the route-access analyzer so a "known"
 * result accounts for every framework-known reader.
 */
function collectAccessSources(
    plugins?: ResolvedPlugin[],
    globalHooks?: RouteHooks
): unknown[] {
    const out: unknown[] = [];
    const pushStage = (value: unknown): void => {
        if (value === undefined) return;
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) out.push(value[i]);
        } else {
            out.push(value);
        }
    };
    const pushHooks = (hooks: {
        beforeRoute?: unknown;
        afterRoute?: unknown;
        mapResponse?: unknown;
        onError?: unknown;
        transform?: unknown;
    }): void => {
        pushStage(hooks.beforeRoute);
        pushStage(hooks.afterRoute);
        pushStage(hooks.mapResponse);
        pushStage(hooks.onError);
        if (hooks.transform !== undefined) out.push(hooks.transform);
    };
    if (globalHooks) pushHooks(globalHooks);
    if (plugins) {
        for (let i = 0; i < plugins.length; i++) pushHooks(plugins[i]!.hooks);
    }
    return out;
}

/**
 * Builds one method's executor. The empty-plan path calls the handler
 * directly with a synchronous try/catch; the Response check and `ctx.set`
 * merge happen in `settle`, and failures render through the same
 * `dispatchOnError` path the hook pipeline uses.
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
    ipHolder: RequestIPHolder | undefined,
    globalResponse: GlobalResponsePlan
): RouteCore {
    // The framework's auto OPTIONS answers directly: no beforeRoute (auth
    // hooks must not reject CORS preflights) and no route hooks. Global and
    // plugin response hooks still run (headers on preflight), as does
    // `ctx.set` seeded by onRequest.
    if ((rawHandler as { isAutoOptions?: boolean }).isAutoOptions) {
        if (!hasGlobalResponseHooks(globalResponse)) {
            return () => (rawHandler as unknown as () => Response)();
        }
        return (request, _ctxInit, prebuilt, env, executionCtx) => {
            const ctx =
                prebuilt ??
                BurgerContext.create(
                    request,
                    undefined,
                    undefined,
                    services,
                    undefined,
                    env,
                    executionCtx,
                    ipHolder
                );
            const response = (rawHandler as unknown as () => Response)();
            return runGlobalResponseHooks(globalResponse, ctx, response).then(
                (res) => (ctx.hasSet() ? applySet(res, ctx.set) : res)
            );
        };
    }

    // `isWildcard` may be unset on hand-built AOT definitions; the pattern is
    // authoritative (extractCtxInit always keyed off it too).
    const hasWildcard = isWildcard || pattern.includes('*');

    // When the analyzer proved (`unknown === false`) that neither the handler
    // nor any framework-known hook reads params/wildcardParams, and the method
    // declares no params validator, per-request extraction (Bun record copy /
    // URL split + decode) is skipped. `ctx.params` still materializes lazily
    // as `{}` if unforeseen code reads it, matching the documented
    // empty-record default.
    const needsParams =
        meta.unknown !== false ||
        meta.has('params') ||
        meta.has('wildcardParams') ||
        methodHasSlot(plan.validators, method, 'params');
    // The pattern's segment layout is compiled ONCE here; request handling
    // does a single URL scan and decodes only `%`-bearing segments.
    const compiledPattern =
        needsParams && !staticRouteMeta
            ? compilePatternSegments(pattern)
            : undefined;

    const resolveCtxInit = (request: Request): ContextInit => {
        if (staticRouteMeta) return { route: staticRouteMeta };
        if (!needsParams) {
            // Only the pattern is carried so `ctx.route` can still derive its
            // concrete path lazily.
            return { pattern };
        }
        // Wildcards are not exposed by Bun's `request.params`; the URL is
        // needed to split the captured segments.
        if (hasWildcard) {
            return extractCtxInitWithSegments(
                request,
                pattern,
                compiledPattern!
            );
        }
        // Bun decodes `:param` values already; use its record directly (a
        // plain object with `Record<string,string>` semantics) and keep the
        // route identity lazy. Direct (non-Bun) invocations fall back to URL
        // extraction.
        const bunParams = (request as { params?: Record<string, string> })
            .params;
        return bunParams !== undefined
            ? { params: bunParams, pattern }
            : extractCtxInitWithSegments(request, pattern, compiledPattern!);
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

    const finish = (ctx: BurgerContext, response: Response): Response =>
        ctx.hasSet() ? applySet(response, ctx.set) : response;

    /**
     * Error exit: dispatch through `onError`, run the global/plugin response
     * hooks (route-level response hooks stay off the error path, as before),
     * then apply `ctx.set` like every other path. `applySet` keeps the error
     * status; only headers/other mutations are merged.
     */
    const finishError = globalErrorFinisher(globalResponse);
    const fail = (ctx: BurgerContext, error: unknown): Promise<Response> =>
        finishError(
            dispatchOnError(
                error,
                plan.onError,
                ctx,
                plan.debug,
                plan.validatorConfig
            ),
            ctx
        ).then((response) => {
            const mutated = finish(ctx, response);
            return mutated;
        });

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
        return mutated;
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
    ): Response | Promise<Response> => {
        if (jit) {
            if (jitFn === undefined) {
                // The handler is passed for compile-time async analysis only;
                // the generated function still receives it per request.
                jitFn = compileJitHookPlan(plan, plan.debug, planHandler);
            }
            const compiled = jitFn;
            if (compiled) {
                // The compiled function stays synchronous when every step was
                // provably sync — no `Promise.resolve` wrapper on that path.
                return compiled(ctx, handler, request.method);
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
        const result = runPlan(ctx, planHandler, request);
        // Sync-first exit: a synchronously resolved plan finishes without an
        // extra `.then` microtask.
        if (isThenable(result)) {
            return result.then((response) => {
                const mutated = finish(ctx, response);
                return mutated;
            });
        }
        const mutated = finish(ctx, result);
        return mutated;
    };
}

/**
 * The `fetch`-facing dispatcher for one route: method lookup against the
 * precomputed specialized executors (auto-HEAD and auto-OPTIONS included),
 * otherwise 405 + Allow. The hook plan already ran inside the executor.
 *
 * Sync-first: a synchronously resolved executor returns its `Response`
 * directly; only async plans produce a Promise.
 */
function buildFallbackHandler(
    cores: NativeMethodCores,
    allow: string
): CompiledHandler {
    return (request, ctxInit, prebuilt, env, executionCtx) => {
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
 * True when the method's compiled validators declare `slot`. HEAD reuses
 * GET's validators (auto-HEAD derives from GET), so a params validator never
 * loses its input.
 */
function methodHasSlot(
    validators: CompiledRouteValidators | undefined,
    method: string,
    slot: 'params' | 'query' | 'headers' | 'cookies' | 'body'
): boolean {
    if (!validators) return false;
    const lower = method.toLowerCase() as LowercaseHTTPMethod;
    let methodValidators = validators.methods[lower];
    if (!methodValidators && lower === 'head') {
        methodValidators = validators.methods['get'];
    }
    return methodValidators?.[slot] !== undefined;
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
 * `Bun.nativeStaticResponse`. Only safe when the route has no hooks, no
 * schema, and uses the auto OPTIONS handler, so the response is identical
 * for every request. Pure performance optimization; the pipeline works
 * without it.
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
    const nativeStaticResponse =
        typeof Bun === 'undefined'
            ? undefined
            : (Bun as { nativeStaticResponse?: NativeStaticResponse })
                  .nativeStaticResponse;
    if (typeof nativeStaticResponse !== 'function') {
        return;
    }
    if (hasSchema) {
        return;
    }
    const opt = def.handlers['OPTIONS'] as
        (typeof def.handlers)['OPTIONS'] | undefined;
    if (opt && (opt as { isAutoOptions?: boolean }).isAutoOptions === true) {
        try {
            nativeStaticResponse(
                'OPTIONS',
                path,
                new Response(null, {
                    status: 204,
                    headers: {
                        Allow:
                            (opt as { allowHeader?: string }).allowHeader ?? '',
                    },
                })
            );
        } catch {
            // Native static response not available for this path; the compiled
            // handler still serves OPTIONS correctly, so ignore.
        }
    }
}
