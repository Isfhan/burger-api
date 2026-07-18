import type {
    Middleware,
    RouteDefinition,
    BurgerRequest,
    RequestHandler,
} from '../types/index';
import type { ContextInit, RouteAccessInfo } from '../context/types';
import { compileRouteSchema, clearValidatorCache } from '../validation/compiler';
import { createValidatorMiddleware } from '../validation/validator';
import { runWithMiddleware } from '../middleware/runner';
import { methodNotAllowed, autoOptionsHandler, applySet } from '../utils/response';
import { BurgerContext } from '../context/context';
import { analyzeRouteAccess } from '../analysis/route-access-analyzer';
import { AllowCache } from './allow-cache';
import { StaticMap } from './static-map';
import { Trie } from './trie';
import { ROUTE_CONSTANTS } from '../utils/routing';
import { validateResponse } from '../validation/response';
import type { CompiledHandler, CompiledRouter, CompiledRoute } from './types';
import type { CompiledRouteValidators, ValidatorConfig } from '../validation/types';

/**
 * Compiles a `RouteDefinition[]` into the dispatch structures used by `Router`.
 *
 * Responsibilities:
 * - Build the optimized `CompiledHandler` per route (method dispatch + 405/Allow
 *   + auto-HEAD + middleware pipeline delegation).
 * - Classify each route as static (→ `StaticMap`) or dynamic/wildcard (→ `Trie`).
 * - Populate the `AllowCache`.
 * - Optionally run the `RouteAccessAnalyzer` once per route (compile-time only;
 *   its output is baked into `meta` but never read at runtime in Phase 2).
 * - Fail fast on duplicate or ambiguous routes (compile-time error).
 * - Optionally register constant `OPTIONS` responses via `Bun.nativeStaticResponse`.
 */
export class RouterCompiler {
    private globalMiddleware: Middleware[];
    private debug: boolean;
    private config: ValidatorConfig;

    constructor(
        globalMiddleware: Middleware[] = [],
        debug = false,
        config: ValidatorConfig = {}
    ) {
        this.globalMiddleware = globalMiddleware;
        this.debug = debug;
        this.config = config;
    }

    compile(defs: RouteDefinition[]): CompiledRouter {
        const staticMap = new StaticMap();
        const trie = new Trie();
        const allowCache = new AllowCache();
        const registeredPaths = new Set<string>();
        // Retained metadata per route (RouteAccessInfo + RouteMeta). Build-time
        // only; never read on the request hot path (see ROADMAP-phase2 §5.7).
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

            // Build the middleware array: global → validation → route-specific.
            const routeMiddleware = def.middleware ?? [];
            const hasSchema = !!def.schema;
            let routeValidators:
                | import('../validation/types').CompiledRouteValidators
                | undefined;
            const total =
                this.globalMiddleware.length +
                (hasSchema ? 1 : 0) +
                routeMiddleware.length;

            const middlewares: Middleware[] = new Array(total);
            let idx = 0;
            for (let i = 0; i < this.globalMiddleware.length; i++) {
                middlewares[idx++] = this.globalMiddleware[i];
            }
            if (hasSchema) {
                // Phase 3: compile the schema ONCE here (before serve()),
                // then wrap the precompiled validators in the orchestrator.
                // The same compiled validators are retained on the route.
                const validators = compileRouteSchema(
                    def.schema!,
                    this.config
                );
                middlewares[idx++] = createValidatorMiddleware(
                    validators,
                    this.config,
                    this.debug === true
                );
                routeValidators = validators;
            }
            for (let i = 0; i < routeMiddleware.length; i++) {
                middlewares[idx++] = routeMiddleware[i];
            }

            // Optional, compile-time-only route field analysis. The result is
            // baked into `meta` but is unused at runtime in Phase 2, so it can
            // never affect request correctness.
            const meta: RouteAccessInfo = analyzeRouteAccess(def, this.debug);

            const isWildcard = def.isWildcard === true;
            const compiled = buildCompiledHandler(
                handlers,
                middlewares,
                allow,
                meta,
                routeValidators,
                this.config,
                this.debug
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
                //  Router.fetch, so it never shadows a `:param` empty-value match.)
                registerNativeOptions(path, def, this.globalMiddleware, routeMiddleware, hasSchema);
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
            }
        }

        return { staticMap, trie, allowCache, routes: compiledRoutes };
    }
}

/**
 * Builds a compiled handler that performs method dispatch, 405+Allow,
 * auto-HEAD, creates the single `BurgerContext`, delegates to the middleware
 * pipeline, and merges `ctx.set` into the response via `applySet`.
 */
function buildCompiledHandler(
    handlers: { [method: string]: RequestHandler },
    middlewares: Middleware[],
    allow: string,
    meta: RouteAccessInfo,
    validators?: CompiledRouteValidators,
    config: ValidatorConfig = {},
    debug = false
): CompiledHandler {
    // Dev mode (observe-only for response validation) follows the server's
    // debug flag, mirroring Burger's own dev detection (phase3 D7).
    const isDev = debug === true;
    return async (request: Request, ctxInit?: ContextInit): Promise<Response> => {
        const method = request.method;
        let handler = handlers[method];

        // Create the one `BurgerContext` for this request. `meta` is accepted
        // but ignored at runtime (Phase 2).
        const ctx = BurgerContext.create(request, ctxInit, meta);
        const burgerReq = ctx as unknown as BurgerRequest;

        // Auto-HEAD: derive from GET when no explicit HEAD handler exists.
        if (!handler && method === 'HEAD' && handlers.GET) {
            handler = handlers.GET;
            const response = await runWithMiddleware(
                burgerReq,
                middlewares,
                handler
            );
            // Response validation applies to HEAD too: a route declaring a
            // `response` schema on GET must still pass the same response
            // validation when derived from GET (phase3 M5 — single pipeline,
            // no fork). The GET-derived response is validated before the body
            // is stripped, so the schema sees the real payload. We validate
            // against the GET response schema (HEAD is derived from GET).
            if (validators?.response) {
                const body = await safeJson(response);
                const outcome = validateResponse(
                    validators,
                    'get',
                    response.status,
                    body,
                    config,
                    isDev
                );
                if (!outcome.ok && outcome.errorResponse) {
                    return outcome.errorResponse;
                }
            }
            // Uniform response mutation (ROADMAP-phase2 §8.7): apply `ctx.set`
            // first, then strip the body from the mutated response.
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

        const response = await runWithMiddleware(burgerReq, middlewares, handler);
        // Phase 3 (M5): response validation as a post-handler step inside the
        // same single pipeline (no fork). Early-returns when no response schema.
        if (validators?.response) {
            const body = await safeJson(response);
            const outcome = validateResponse(
                validators,
                method.toLowerCase(),
                response.status,
                body,
                config,
                isDev
            );
            if (!outcome.ok && outcome.errorResponse) {
                return outcome.errorResponse;
            }
            // `safeJson` may have consumed the response stream. If it parsed a
            // JSON body, rebuild the Response from it so the body is not lost
            // (phase3 §8.4 — dev/observe passes the handler response through).
            // For non-JSON responses `body` is undefined; return original.
            if (body !== undefined) {
                const rebuilt = new Response(JSON.stringify(body), {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
                return applySet(rebuilt, ctx.set);
            }
        }
        // The only response-path mutation added in Phase 2: merge `ctx.set`.
        return applySet(response, ctx.set);
    };
}

/** Reads a JSON body for response validation without consuming the stream
 * when it is not JSON. Falls back to undefined (validation sees no body). */
async function safeJson(response: Response): Promise<unknown> {
    const ct = response.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return undefined;
    try {
        return await response.json();
    } catch {
        return undefined;
    }
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
 * `Bun.nativeStaticResponse`. Only safe when the route has no middleware,
 * no schema, and uses the framework's auto-generated OPTIONS handler — so the
 * response is identical for every request. The pipeline works correctly without
 * this; it is a pure performance optimization.
 */
function registerNativeOptions(
    path: string,
    def: RouteDefinition,
    globalMiddleware: Middleware[],
    routeMiddleware: Middleware[],
    hasSchema: boolean
): void {
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
    if (globalMiddleware.length > 0 || routeMiddleware.length > 0 || hasSchema) {
        return;
    }
    const opt = def.handlers['OPTIONS'];
    if (opt && opt === autoOptionsHandler) {
        try {
            nativeStaticResponse('OPTIONS', path, new Response(null, { status: 204 }));
        } catch {
            // Native static response not available for this path; the compiled
            // handler still serves OPTIONS correctly, so ignore.
        }
    }
}
