/**
 * Internal types for the prototype-based request context. `BurgerContext`
 * re-exports the public ones (`ContextSet`, `RouteMeta`).
 */

/**
 * The request fields `RouteAccessAnalyzer` can reason about — the lazy
 * surface `BurgerContext` exposes.
 */
export type ContextField =
    | 'params'
    | 'query'
    | 'cookies'
    | 'headers'
    | 'json'
    | 'validated'
    | 'set'
    | 'route'
    | 'services'
    | 'request'
    | 'wildcardParams';

/**
 * Route-specific data passed from `Router.fetch` when seeding
 * `BurgerContext`. Only fields relevant to the matched route are populated.
 */
export interface ContextInit {
    params?: Record<string, string>;
    wildcardParams?: string[];
    route?: RouteMeta;
    /**
     * Route pattern for natively dispatched matches. When `route` is absent,
     * the `route` getter derives `RouteMeta` from this lazily.
     */
    pattern?: string;
}

/**
 * The response-mutation surface exposed through `ctx.set`.
 * `cookies` is intentionally absent (reserved for a future release).
 */
export interface ContextSet {
    status?: number;
    /**
     * Response headers. A value may be an array: array values (and
     * `Set-Cookie` values) are appended, so multiple cookies survive.
     */
    headers?: Record<string, string | string[]> | Headers;
}

/**
 * What `RouteAccessAnalyzer` found a route to use (request fields and hook
 * stages). Frozen; an optimization hint only — never read at runtime.
 */
export interface RouteAccessInfo {
    /** The set of fields the analyzer determined the route reads. */
    access: ReadonlySet<ContextField>;
    /**
     * When `true`, the analyzer could not prove what the route reads (ambiguous
     * source or `debug` mode), so every field must be treated as used — the safe
     * default.
     */
    unknown: boolean;
    /** The set of lifecycle hook stages the route uses. */
    hooks: ReadonlySet<string>;
    /** Reports whether `field` is considered accessed by this route. */
    has(field: ContextField): boolean;
}

/**
 * The matched-route identity exposed as `ctx.route`. `path` is the concrete
 * requested pathname (never the query string); `pattern` is the route pattern
 * (e.g. `/users/:id`).
 */
export interface RouteMeta {
    path: string;
    pattern: string;
}
