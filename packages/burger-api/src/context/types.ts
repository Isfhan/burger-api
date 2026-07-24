/**
 * Internal types for the prototype-based Phase 2 request context.
 *
 * These types are framework-internal. `BurgerRequest` (in `../types/index`)
 * re-exports the public-facing ones (`ContextSet`, `RouteMeta`) and gains the
 * additive optional fields `query` / `set` / `route`.
 */

/**
 * The closed set of request fields `RouteAccessAnalyzer` can reason about.
 * The list mirrors the lazy surface `BurgerContext` exposes.
 */
export type ContextField =
    | 'params'
    | 'query'
    | 'headers'
    | 'json'
    | 'validated'
    | 'set'
    | 'route'
    | 'wildcardParams';

/**
 * The route-specific data passed from `Router.fetch` into the compiled handler,
 * which seeds `BurgerContext` at creation time. Only the fields relevant to the
 * matched route are populated (a static route has no `params`/`wildcardParams`).
 */
export interface ContextInit {
    params?: Record<string, string>;
    wildcardParams?: string[];
    route?: RouteMeta;
}

/**
 * The Phase 2 response-mutation surface exposed through `req.set`.
 * `cookies` is intentionally absent (reserved for Phase 7).
 */
export interface ContextSet {
    status?: number;
    headers?: Record<string, string> | Headers;
}

/**
 * The immutable information produced by `RouteAccessAnalyzer` describing which
 * request fields and lifecycle hooks a route uses. It is an optimization hint
 * only — the framework never reads it at runtime in Phase 2.
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
    /** The set of lifecycle hook stages the route uses (Phase 4 M7). */
    hooks: ReadonlySet<string>;
    /** Reports whether `field` is considered accessed by this route. */
    has(field: ContextField): boolean;
}

/**
 * The matched-route identity exposed as `req.route`.
 * `path` is the concrete requested pathname (never the query string);
 * `pattern` is the route-definition pattern (e.g. `/users/:id`).
 */
export interface RouteMeta {
    path: string;
    pattern: string;
}
