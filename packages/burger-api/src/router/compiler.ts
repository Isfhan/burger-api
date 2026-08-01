import type { RouteDefinition, RequestHandler } from '../types/index';
import type { RouteModule } from '../compiler/route-module';
import type { ContextInit, RouteAccessInfo } from '../context/types';
import { compileRouteSchema } from '../validation/compiler';
import { createValidatorMiddleware } from '../validation/validator';
import {
    methodNotAllowed,
    autoOptionsHandler,
    applySet,
} from '../utils/response';
import { executeHookPlan } from '../lifecycle/executor';
import type { HookPlan, RouteHooks, TransformMap } from '../lifecycle/types';
import { HookChain } from '../chain/chain';
import { flatten } from '../chain/flattener';
import { composePluginHooks } from '../plugin/composer';
import type { ResolvedPlugin } from '../plugin/types';
import { BurgerContext } from '../context/context';
import { analyzeRouteAccess } from '../analysis/route-access-analyzer';
import { AllowCache } from './allow-cache';
import { StaticMap } from './static-map';
import { Trie } from './trie';
import { ROUTE_CONSTANTS } from '../utils/routing';
import { extractCtxInit } from './param-extract';
import type { CompiledHandler, CompiledRouter, CompiledRoute } from './types';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
} from '../validation/types';

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
    private debug: boolean;
    private config: ValidatorConfig;

    constructor(debug = false, config: ValidatorConfig = {}) {
        this.debug = debug;
        this.config = config;
    }

    compile(
        defs: RouteDefinition[],
        plugins?: ResolvedPlugin[],
        providers?: Map<string, unknown>,
        onRequestHooksCount: number = 0
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
        const registeredPaths = new Set<string>();
        // Retained metadata per route (RouteAccessInfo + RouteMeta). Build-time
        // only; never read on the request hot path.
        const compiledRoutes = new Map<string, CompiledRoute>();

        for (const def of defs) {
            const path = def.path;
            const handlers = def.handlers;

            // Allow header: the route's explicitly defined methods (HEAD is not
            // listed unless the user defined it — auto-HEAD is derived, not advertised).
            const allowMethods = Object.keys(handlers).filter(
                (m) => m !== 'HEAD'
            );
            const allow = allowCache.compute(allowMethods);
            allowCache.set(path, allow);

            const hasSchema = !!def.schema;
            let routeValidators:
                | import('../validation/types').CompiledRouteValidators
                | undefined;

            // Compose the frozen `HookPlan` once at compile time.
            // The HookChain collects ChainNodes tagged with scope + owner; the
            // flattener produces the per-phase arrays with correct ordering
            // (global → local for forward phases, local → global for onError).
            // Validation is added as global scope so it pins at index 0.
            const routeHooks = def.hooks as RouteHooks | undefined;
            const chain = new HookChain();
            if (hasSchema) {
                const validators = compileRouteSchema(def.schema!, this.config);
                chain.add({
                    stage: 'validation',
                    fn: createValidatorMiddleware(
                        validators,
                        this.config,
                        this.debug === true
                    ),
                    scope: 'global',
                    owner: 'framework',
                });
                routeValidators = validators;
            }
            chain.addStage(
                'beforeRoute',
                toHookArray(routeHooks?.beforeRoute),
                'local',
                path
            );
            chain.addStage(
                'afterRoute',
                toHookArray(routeHooks?.afterRoute),
                'local',
                path
            );
            chain.addStage(
                'mapResponse',
                toHookArray(routeHooks?.mapResponse),
                'local',
                path
            );
            // onError: reverse because ModuleLoader merges global→route but
            // onError needs route→global (nearest-first). The flattener orders
            // local → global, so reversed local nodes execute route-first.
            chain.addStage(
                'onError',
                toHookArray(routeHooks?.onError).reverse(),
                'local',
                path
            );

            // compose plugin hooks into the chain.
            // Plugin hooks are scoped (plugin by default) and the flattener
            // orders them between global (validation) and local (route).
            if (plugins) {
                composePluginHooks(chain, plugins, path);
            }

            const plan = flatten(chain, path);
            // Merge transform from route hooks and plugins. Route transform takes
            // precedence over plugin transform on key collision.
            plan.transform = mergeTransformRecords(
                routeHooks?.transform,
                plugins
            );

            // Attach compiled validators for response validation post-handler.
            if (routeValidators) {
                plan.validators = routeValidators;
            }

            // Thread debug flag for error rendering.
            plan.debug = this.debug;

            // Thread global validation config for response validation.
            plan.validatorConfig = this.config;

            // Optional, compile-time-only route field analysis. The result is
            // baked into `meta` but is unused at runtime , so it can
            // never affect request correctness.
            const meta: RouteAccessInfo = analyzeRouteAccess(def, this.debug);

            const isWildcard = def.isWildcard === true;
            const compiled = buildCompiledHandler(
                handlers,
                plan,
                allow,
                meta,
                path,
                isWildcard,
                providers,
                def.config
            );

            // Retain compiled-route metadata (RouteAccessInfo + RouteMeta).
            // When a schema exists, also retain the precompiled validators so
            // the validation orchestrator runs them at request time.
            compiledRoutes.set(path, {
                def,
                handler: compiled,
                methods: allowMethods,
                allow,
                route: { path, pattern: path },
                meta,
                validators: routeValidators,
            });

            if (isStaticPath(path)) {
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
                    def,
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
                // Register on Bun's native router (no `fetch` hop). The handler
                // carries the route pattern + wildcard flag so it can derive
                // `params` / `wildcardParams` from the URL itself.
                nativeRoutes.set(path, compiled);
            }
        }

        return {
            staticMap,
            trie,
            allowCache,
            nativeRoutes,
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
        hooks: mod.hooks as RouteHooks | undefined,
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

/**
 * Builds a compiled handler that performs method dispatch, 405+Allow,
 * auto-HEAD, creates the single `BurgerContext`, delegates to the hook
 * pipeline, and merges `ctx.set` into the response via `applySet`.
 */
function buildCompiledHandler(
    handlers: { [method: string]: RequestHandler },
    plan: HookPlan,
    allow: string,
    meta: RouteAccessInfo,
    pattern: string = '',
    isWildcard: boolean = false,
    providers?: Map<string, unknown>,
    config?: Record<string, unknown>
): CompiledHandler {
    return async (
        request: Request,
        ctxInit?: ContextInit
    ): Promise<Response> => {
        const method = request.method;
        let handler = handlers[method];

        // When dispatched natively (Bun's `routes` map), no `ctxInit` is
        // provided, so derive params / wildcardParams / route from the URL.
        // When dispatched via the `fetch` fallback (trie) or a static wrapper,
        // `ctxInit` is already populated.
        const resolvedCtxInit =
            ctxInit ?? extractCtxInit(request, pattern, isWildcard);

        // Create the one `BurgerContext` for this request. `meta` is accepted
        // but ignored at runtime.
        const ctx = BurgerContext.create(
            request,
            resolvedCtxInit,
            meta,
            providers,
            config
        );

        // Auto-HEAD: derive from GET when no explicit HEAD handler exists.
        if (!handler && method === 'HEAD' && handlers.GET) {
            handler = handlers.GET;
            const response = await executeHookPlan(
                ctx,
                plan,
                handlers,
                request
            );
            // Uniform response mutation: apply `ctx.set`,
            // then strip the body from the mutated response.
            const mutated = applySet(response, ctx.set);
            return new Response(null, {
                status: mutated.status,
                statusText: mutated.statusText,
                headers: mutated.headers,
            });
        }

        if (!handler) {
            return methodNotAllowed(allow);
        }

        const response = await executeHookPlan(ctx, plan, handlers, request);
        return applySet(response, ctx.set);
    };
}

/**
 * Merges transform records from route hooks and plugins. Plugin transform records
 * are applied first, then route-level transform overrides on key collision.
 */
function mergeTransformRecords(
    routeTransform: TransformMap | undefined,
    plugins?: ResolvedPlugin[]
): TransformMap | undefined {
    const merged: TransformMap = {};
    if (plugins) {
        for (const p of plugins) {
            if (p.hooks.transform) {
                for (const k of Object.keys(p.hooks.transform)) {
                    merged[k] = p.hooks.transform[k];
                }
            }
        }
    }
    if (routeTransform) {
        for (const k of Object.keys(routeTransform)) {
            merged[k] = routeTransform[k];
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
    // Bun versions. Detect it at runtime; the pipeline works without it.
    type NativeStaticResponse = (
        method: string,
        path: string,
        response: Response
    ) => void;
    const nativeStaticResponse = (
        Bun as { nativeStaticResponse?: NativeStaticResponse }
    ).nativeStaticResponse;
    if (typeof nativeStaticResponse !== 'function') {
        return;
    }
    if (hasSchema) {
        return;
    }
    const opt = def.handlers['OPTIONS'];
    if (opt && opt === autoOptionsHandler) {
        try {
            nativeStaticResponse(
                'OPTIONS',
                path,
                new Response(null, { status: 204 })
            );
        } catch {
            // Native static response not available for this path; the compiled
            // handler still serves OPTIONS correctly, so ignore.
        }
    }
}
