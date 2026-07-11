import type {
    Middleware,
    RouteDefinition,
    BurgerRequest,
    RequestHandler,
} from '../types/index';
import { createValidationMiddleware } from '../middleware/validator';
import { runWithMiddleware } from '../middleware/runner';
import { methodNotAllowed, autoOptionsHandler } from '../utils/response';
import { AllowCache } from './allow-cache';
import { StaticMap } from './static-map';
import { Trie } from './trie';
import { ROUTE_CONSTANTS } from '../utils/routing';
import type { CompiledHandler, CompiledRouter } from './types';

/**
 * Compiles a `RouteDefinition[]` into the dispatch structures used by `Router`.
 *
 * Responsibilities:
 * - Build the optimized `CompiledHandler` per route (method dispatch + 405/Allow
 *   + auto-HEAD + middleware pipeline delegation).
 * - Classify each route as static (→ `StaticMap`) or dynamic/wildcard (→ `Trie`).
 * - Populate the `AllowCache`.
 * - Fail fast on duplicate or ambiguous routes (compile-time error).
 * - Optionally register constant `OPTIONS` responses via `Bun.nativeStaticResponse`.
 */
export class RouterCompiler {
    private globalMiddleware: Middleware[];

    constructor(globalMiddleware: Middleware[] = []) {
        this.globalMiddleware = globalMiddleware;
    }

    compile(defs: RouteDefinition[]): CompiledRouter {
        const staticMap = new StaticMap();
        const trie = new Trie();
        const allowCache = new AllowCache();
        const registeredPaths = new Set<string>();

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
                middlewares[idx++] = createValidationMiddleware(def.schema!);
            }
            for (let i = 0; i < routeMiddleware.length; i++) {
                middlewares[idx++] = routeMiddleware[i];
            }

            const isWildcard = def.isWildcard === true;
            const compiled = buildCompiledHandler(
                handlers,
                middlewares,
                allow
            );

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

        return { staticMap, trie, allowCache };
    }
}

/**
 * Builds a compiled handler that performs method dispatch, 405+Allow,
 * auto-HEAD, and delegate to the middleware pipeline.
 */
function buildCompiledHandler(
    handlers: { [method: string]: RequestHandler },
    middlewares: Middleware[],
    allow: string
): CompiledHandler {
    return async (request: BurgerRequest) => {
        const method = request.method;
        let handler = handlers[method];

        // Auto-HEAD: derive from GET when no explicit HEAD handler exists.
        if (!handler && method === 'HEAD' && handlers.GET) {
            handler = handlers.GET;
            const response = await runWithMiddleware(
                request,
                middlewares,
                handler
            );
            return new Response(null, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        }

        if (!handler) {
            return methodNotAllowed(allow);
        }

        return runWithMiddleware(request, middlewares, handler);
    };
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
    const nativeStaticResponse = (Bun as any)?.nativeStaticResponse;
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
