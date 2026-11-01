import type { PageDefinition, RouteDefinition, TrieNode } from '../types/index.js';

/**
 * Constants for route handling.
 */
export const ROUTE_CONSTANTS = {
    // Supported page extensions
    SUPPORTED_PAGE_EXTENSIONS: ['.tsx', '.html'],
    // Page index files
    PAGE_INDEX_FILES: ['index.tsx', 'index.html'],
    // Dynamic route constants
    DYNAMIC_SEGMENT_PREFIX: ':',
    DYNAMIC_FOLDER_START: '[',
    DYNAMIC_FOLDER_END: ']',
    // Grouping folder constants
    GROUPING_FOLDER_START: '(',
    GROUPING_FOLDER_END: ')',
    // Wildcard route constants
    WILDCARD_SEGMENT_PREFIX: '*',
    WILDCARD_SIMPLE: '[...]',
    WILDCARD_START: '[...',
};

/**
 * Supported HTTP methods as a literal tuple; the names double as the
 * `HTTPMethod` union.
 */
export const HTTP_METHODS = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'HEAD',
    'OPTIONS',
] as const;

/**
 * The closed set of HTTP methods a route can handle, uppercase as used in
 * `RouteDefinition.handlers` and `request.method`.
 */
export type HTTPMethod = (typeof HTTP_METHODS)[number];

/**
 * Lowercase form of `HTTPMethod`, used by the lowercase-keyed maps
 * (`RouteSchema`, `openapi`, compiled validators).
 */
export type LowercaseHTTPMethod = Lowercase<HTTPMethod>;

/**
 * Scores a route path by specificity: +1 per static segment, 0 per dynamic
 * (`:param`, `[param]`), -1 per wildcard. Higher means more static; sorting by
 * it puts static first, dynamic second, wildcard last.
 * @param path The route path to evaluate.
 * @returns The specificity score.
 */
export const getRouteSpecificity = (path: string): number => {
    const segments = path.split('/').filter(Boolean);
    return segments.reduce((score, segment) => {
        if (
            segment.startsWith(ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX) ||
            (segment.startsWith(ROUTE_CONSTANTS.WILDCARD_START) &&
                segment.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END))
        ) {
            return score - 1; // Wildcard routes get the penalty (lowest priority)
        }
        if (
            segment.startsWith(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX) ||
            (segment.startsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_START) &&
                segment.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END))
        ) {
            return score; // Dynamic routes get no static credit
        }
        return score + 1; // Static routes get the credit (highest priority)
    }, 0);
};

/**
 * Compares two routes for sorting: higher specificity first (Static >
 * Dynamic > Wildcard), ties alphabetically by path.
 * @param a The first route to compare.
 * @param b The second route to compare.
 * @returns Negative if a comes first, positive if b does, zero if equal.
 */
export const compareRoutes = (
    a: PageDefinition | RouteDefinition,
    b: PageDefinition | RouteDefinition
): number => {
    const aSpecificity = getRouteSpecificity(a.path);
    const bSpecificity = getRouteSpecificity(b.path);

    if (aSpecificity > bSpecificity) return -1;
    if (aSpecificity < bSpecificity) return 1;
    return a.path.localeCompare(b.path);
};

/**
 * Collects all routes from the trie as `RouteDefinition` objects.
 * @param node The current node in the trie.
 * @param currentPath The current path being traversed.
 * @param routes The array of collected routes.
 * @returns The collected routes.
 */
export function collectRoutes(
    node: TrieNode,
    currentPath: string = '',
    routes: RouteDefinition[] = []
): RouteDefinition[] {
    if (node.route) {
        routes.push({
            ...node.route,
            path: currentPath,
        });
    }

    // Traverse static children
    node.children.forEach((child: TrieNode, segment: string) => {
        collectRoutes(child, `${currentPath}/${segment}`, routes);
    });

    // Traverse dynamic child if exists
    if (node.paramChild) {
        const paramPath = `${currentPath}/:${node.paramChild.paramName}`;
        collectRoutes(node.paramChild, paramPath, routes);
    }

    // Traverse wildcard child if exists (lowest priority)
    if (node.wildcardChild) {
        const wildcardPath = `${currentPath}/${ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX}`;
        collectRoutes(node.wildcardChild, wildcardPath, routes);
    }

    return routes;
}

/**
 * Copies a per-method map (`schema.ts` / `openapi.ts` / `config.ts` exports)
 * with uppercase method keys (`GET`) lowercased (`get`) for the validation
 * compiler, OpenAPI generator and route compiler. Non-method keys (e.g.
 * `coerce`) pass through; never mutates the input (module namespaces are
 * frozen). Returns the input unchanged when it has no uppercase method key,
 * so default-only configs keep their object identity.
 */
export function lowercaseMethodKeys(
    raw: Record<string, unknown> | object
): Record<string, unknown> {
    const entries = Object.entries(raw);
    if (
        !entries.some(([key]) =>
            (HTTP_METHODS as readonly string[]).includes(key)
        )
    ) {
        return raw as Record<string, unknown>;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of entries) {
        const isMethod = (HTTP_METHODS as readonly string[]).includes(key);
        out[isMethod ? key.toLowerCase() : key] = value;
    }
    return out;
}
