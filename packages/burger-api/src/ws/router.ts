/**
 * Matches WebSocket paths to compiled handlers.
 */

import type { CompiledWebSocketRoute } from './types.js';

/**
 * WebSocket router: matches incoming paths to handlers.
 */
export class WebSocketRouter {
    private routes: CompiledWebSocketRoute[] = [];
    private staticRoutes: Map<string, CompiledWebSocketRoute> = new Map();
    private paramRoutes: CompiledWebSocketRoute[] = [];
    private wildcardRoutes: CompiledWebSocketRoute[] = [];

    /**
     * Add a compiled route to the router
     */
    addRoute(route: CompiledWebSocketRoute): void {
        this.routes.push(route);

        // Categorize routes. Param and wildcard routes are kept sorted by
        // specificity (static segment > param > wildcard at the first
        // differing segment; longer wildcard prefix first), matching HTTP
        // dispatch. The sort is stable, so equal patterns keep insertion order.
        if (route.path.includes('*')) {
            this.wildcardRoutes.push(route);
            this.wildcardRoutes.sort(compareWildcardSpecificity);
        } else if (route.path.includes(':')) {
            this.paramRoutes.push(route);
            this.paramRoutes.sort(compareRouteSpecificity);
        } else {
            this.staticRoutes.set(route.path, route);
        }
    }

    /**
     * Add multiple compiled routes
     */
    addRoutes(routes: CompiledWebSocketRoute[]): void {
        for (const route of routes) {
            this.addRoute(route);
        }
    }

    /**
     * Match a WebSocket path to a route. Static beats param beats wildcard;
     * among param routes the most specific (leftmost static segment) wins.
     */
    match(
        path: string
    ): {
        route: CompiledWebSocketRoute;
        params: Record<string, string>;
        wildcardParams: string[];
    } | null {
        // A trailing slash is ignored, like HTTP routing (`/chat/` ≡ `/chat`).
        if (path.length > 1 && path.endsWith('/')) {
            path = path.replace(/\/+$/, '') || '/';
        }

        // Try static routes first (fastest)
        const staticRoute = this.staticRoutes.get(path);
        if (staticRoute) {
            return { route: staticRoute, params: {}, wildcardParams: [] };
        }

        // Try parameterized routes
        for (const route of this.paramRoutes) {
            const params = this.matchParams(route.path, path);
            if (params !== null) {
                return { route, params, wildcardParams: [] };
            }
        }

        // Try wildcard routes
        for (const route of this.wildcardRoutes) {
            const result = this.matchWildcard(route.path, path);
            if (result !== null) {
                return { route, params: result.params, wildcardParams: result.wildcardParams };
            }
        }

        return null;
    }

    /**
     * Get all registered routes
     */
    getRoutes(): CompiledWebSocketRoute[] {
        return this.routes;
    }

    /**
     * Get route count
     */
    getRouteCount(): number {
        return this.routes.length;
    }

    /**
     * Match path parameters (e.g., /chat/:room)
     */
    private matchParams(
        pattern: string,
        path: string
    ): Record<string, string> | null {
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');

        if (patternParts.length !== pathParts.length) {
            return null;
        }

        const params: Record<string, string> = {};

        for (let i = 0; i < patternParts.length; i++) {
            const patternPart = patternParts[i]!;
            const pathPart = pathParts[i]!;

            if (patternPart.startsWith(':')) {
                // Parameter: never matches an empty segment; URL-decoded.
                if (pathPart === '') return null;
                const paramName = patternPart.slice(1);
                try {
                    params[paramName] = decodeURIComponent(pathPart);
                } catch {
                    params[paramName] = pathPart;
                }
            } else if (patternPart !== pathPart) {
                // Static mismatch
                return null;
            }
        }

        return params;
    }

    /**
     * Match wildcard path (e.g., /files/*). Keeps `params['*']` as the raw
     * remainder and adds the decoded per-segment `wildcardParams` array that
     * mirrors HTTP `ctx.wildcardParams`.
     */
    private matchWildcard(
        pattern: string,
        path: string
    ): {
        params: Record<string, string>;
        wildcardParams: string[];
    } | null {
        // Remove trailing * for comparison
        const basePattern = pattern.replace(/\*$/, '');
        const basePath = path.slice(0, basePattern.length);

        if (basePath !== basePattern) {
            return null;
        }

        // Extract wildcard value
        const wildcardValue = path.slice(basePattern.length);
        const wildcardParams: string[] = [];
        if (wildcardValue !== '') {
            for (const segment of wildcardValue.split('/')) {
                wildcardParams.push(decodeSegment(segment));
            }
        }

        return { params: { '*': wildcardValue }, wildcardParams };
    }
}

/** Decodes a path segment, falling back to the raw value on bad escapes. */
function decodeSegment(segment: string): string {
    if (segment === '' || segment.indexOf('%') === -1) return segment;
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/** Specificity rank: static 0, param 1, wildcard 2, missing 3. */
function segmentRank(segment: string | undefined): number {
    if (segment === undefined) return 3;
    if (segment === '*') return 2;
    if (segment.startsWith(':')) return 1;
    return 0;
}

/** Compares two param patterns; lower rank at the first difference wins. */
function compareRouteSpecificity(
    a: CompiledWebSocketRoute,
    b: CompiledWebSocketRoute
): number {
    const aParts = a.path.split('/');
    const bParts = b.path.split('/');
    const length = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < length; i++) {
        const diff = segmentRank(aParts[i]) - segmentRank(bParts[i]);
        if (diff !== 0) return diff;
    }
    return 0;
}

/** Longer wildcard prefix is more specific. */
function compareWildcardSpecificity(
    a: CompiledWebSocketRoute,
    b: CompiledWebSocketRoute
): number {
    return b.path.replace(/\*$/, '').length - a.path.replace(/\*$/, '').length;
}
