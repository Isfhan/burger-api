import type { PageDefinition, RouteDefinition, TrieNode } from '../types/index';

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
 * Supported HTTP methods, as a literal tuple so the method names can be
 * reused as a type union (`HTTPMethod`) across the public API.
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
 * The closed set of HTTP methods a route can handle, in the uppercase form
 * used by `RouteDefinition.handlers` keys and `request.method` at runtime.
 */
export type HTTPMethod = (typeof HTTP_METHODS)[number];

/**
 * Lowercase form of `HTTPMethod`, used by the lowercase-keyed maps
 * (`RouteSchema`, `openapi`, compiled validators) at runtime.
 */
export type LowercaseHTTPMethod = Lowercase<HTTPMethod>;

/**
 * Calculates the specificity of a route path based on the number of static segments.
 * Static segments increase the score, while dynamic segments (:param) do not.
 * Wildcard segments (*) have the lowest specificity (highest penalty).
 * @param path The route path to evaluate.
 * @returns The specificity score (higher means more static segments, lower priority for wildcard).
 */
export const getRouteSpecificity = (path: string): number => {
    const segments = path.split('/').filter(Boolean);
    return segments.reduce((score, segment) => {
        if (segment.startsWith(ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX)) {
            return score + 1000; // Wildcard routes get highest penalty (lowest priority)
        }
        return segment.startsWith(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX)
            ? score + 100 // Dynamic routes get medium penalty
            : score + 1; // Static routes get minimal penalty
    }, 0);
};

/**
 * Compares two routes for sorting, prioritizing those with higher specificity (more static segments).
 * Route prioritization: Static > Dynamic > Wildcard.
 * If specificity is equal, sorts alphabetically by path.
 * @param a The first route to compare.
 * @param b The second route to compare.
 * @returns Negative if a comes before b, positive if b comes before a, zero if equal.
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
 * Collects all routes from the trie and returns them as an array of RouteDefinition objects.
 * @param node The current node in the trie.
 * @param currentPath The current path being traversed.
 * @param routes The array of collected routes.
 * @returns An array of RouteDefinition objects.
 */
export function collectRoutes(
    node: TrieNode,
    currentPath: string = '',
    routes: RouteDefinition[] = []
): RouteDefinition[] {
    // If this node has a route definition, add it
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
        // const wildcardPath = `${currentPath}/${node.wildcardChild.wildcardParamName}`;
        const wildcardPath = `${currentPath}/${ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX}`;
        collectRoutes(node.wildcardChild, wildcardPath, routes);
    }

    return routes;
}
