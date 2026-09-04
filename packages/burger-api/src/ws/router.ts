/**
 * WebSocket router
 * Maps WebSocket paths to compiled handlers
 */

import type { CompiledWebSocketRoute } from './types.js';

/**
 * WebSocket router
 * Matches incoming WebSocket paths to handlers
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

        // Categorize routes
        if (route.path.includes('*')) {
            this.wildcardRoutes.push(route);
        } else if (route.path.includes(':')) {
            this.paramRoutes.push(route);
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
     * Match a WebSocket path to a route
     */
    match(
        path: string
    ): {
        route: CompiledWebSocketRoute;
        params: Record<string, string>;
    } | null {
        // Try static routes first (fastest)
        const staticRoute = this.staticRoutes.get(path);
        if (staticRoute) {
            return { route: staticRoute, params: {} };
        }

        // Try parameterized routes
        for (const route of this.paramRoutes) {
            const params = this.matchParams(route.path, path);
            if (params !== null) {
                return { route, params };
            }
        }

        // Try wildcard routes
        for (const route of this.wildcardRoutes) {
            const params = this.matchWildcard(route.path, path);
            if (params !== null) {
                return { route, params };
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
                // Parameter
                const paramName = patternPart.slice(1);
                params[paramName] = pathPart;
            } else if (patternPart !== pathPart) {
                // Static mismatch
                return null;
            }
        }

        return params;
    }

    /**
     * Match wildcard path (e.g., /files/*)
     */
    private matchWildcard(
        pattern: string,
        path: string
    ): Record<string, string> | null {
        // Remove trailing * for comparison
        const basePattern = pattern.replace(/\*$/, '');
        const basePath = path.slice(0, basePattern.length);

        if (basePath !== basePattern) {
            return null;
        }

        // Extract wildcard value
        const wildcardValue = path.slice(basePattern.length);

        return { '*': wildcardValue };
    }
}
