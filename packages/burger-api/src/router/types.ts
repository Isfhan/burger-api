import type {
    Middleware,
    RouteDefinition,
    BurgerRequest,
} from '../types/index';

/**
 * A compiled route handler.
 * Both static (Bun-dispatched) and dynamic/wildcard (trie-dispatched) routes
 * execute exactly this same handler shape, guaranteeing identical method
 * dispatch, 405+Allow, auto-HEAD, and middleware behavior regardless of which
 * lookup mechanism reached it.
 */
export type CompiledHandler = (request: BurgerRequest) => Promise<Response>;

/**
 * A route compiled into its dispatch structures.
 */
export interface CompiledRoute {
    def: RouteDefinition;
    handler: CompiledHandler;
    methods: string[];
    allow: string;
}

/**
 * The output of a single RouterCompiler.compile pass.
 */
export interface CompiledRouter {
    staticMap: import('./static-map').StaticMap;
    trie: import('./trie').Trie;
    allowCache: import('./allow-cache').AllowCache;
}

/**
 * Configuration for the Router / RouterCompiler.
 */
export interface RouterConfig {
    globalMiddleware?: Middleware[];
}
