import type {
    Middleware,
    RouteDefinition,
    BurgerRequest,
} from '../types/index';
import type { ContextInit, RouteAccessInfo, RouteMeta } from '../context/types';

/**
 * A compiled route handler.
 * Both static (Bun-dispatched) and dynamic/wildcard (trie-dispatched) routes
 * execute exactly this same handler shape, guaranteeing identical method
 * dispatch, 405+Allow, auto-HEAD, and middleware behavior regardless of which
 * lookup mechanism reached it.
 *
 * Phase 2: the handler receives the raw `Request` plus an optional `ctxInit`
 * (seeded by `Router.fetch`) and is responsible for creating the single
 * `BurgerContext` for the request.
 */
export type CompiledHandler = (
    request: Request,
    ctxInit?: ContextInit
) => Promise<Response>;

/**
 * A route compiled into its dispatch structures.
 */
export interface CompiledRoute {
    def: RouteDefinition;
    handler: CompiledHandler;
    methods: string[];
    allow: string;
    /** The matched-route identity (`path` + `pattern`), retained for introspection. */
    route?: RouteMeta;
    /** The optional RouteAccessAnalyzer hint (unused at runtime in Phase 2). */
    meta?: RouteAccessInfo;
}

/**
 * The output of a single RouterCompiler.compile pass.
 */
export interface CompiledRouter {
    staticMap: import('./static-map').StaticMap;
    trie: import('./trie').Trie;
    allowCache: import('./allow-cache').AllowCache;
    /**
     * Retained compiled-route metadata (RouteAccessInfo + RouteMeta) keyed by
     * path. Build-time only; never consulted on the request hot path.
     */
    routes?: Map<string, CompiledRoute>;
}

/**
 * Configuration for the Router / RouterCompiler.
 */
export interface RouterConfig {
    globalMiddleware?: Middleware[];
    /** When true, the optional RouteAccessAnalyzer is skipped at compile time. */
    debug?: boolean;
}
