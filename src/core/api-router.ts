// Import stuff from node
import { readdir } from 'fs/promises';
import * as path from 'path';

// Import utils
import {
    cleanPrefix,
    normalizePath,
    ROUTE_CONSTANTS,
    HTTP_METHODS,
} from '@utils';

// Import types
import type {
    Middleware,
    RequestHandler,
    RouteDefinition,
    TrieNode,
} from '@burgerTypes';

/**
 * ApiRouter class for handling file-based routing.
 * Loads routes from a directory structure and matches requests to the appropriate route handlers.
 * Supports dynamic segments (e.g., [id] ,(group),[...]) and HTTP method handlers.
 * Routes are sorted to prioritize static routes over dynamic and wildcard ones to prevent overlapping route issues.
 */
export class ApiRouter {
    /** The root of the trie where all routes will begin*/
    private root: TrieNode = { children: new Map() };

    /**
     * Constructor for the ApiRouter class.
     * @param routesDir The directory path where route modules are located.
     * @param prefix Optional prefix to prepend to all routes (e.g., "api" becomes "/api/...").
     * @throws {Error} If the routes directory path is not provided.
     */
    constructor(private routesDir: string, private prefix: string = '') {
        if (!routesDir) {
            throw new Error('Routes directory path is required');
        }
    }

    /**
     * Getter for the routes trie.
     * @returns The root of the trie.
     */
    get routes() {
        return this.root;
    }

    /**
     * Loads all routes from the routes directory into the trie structure.
     * @returns {Promise<void>} A promise that resolves when all routes are loaded.
     * @throws {Error} If the routes directory is not found or if an error occurs during route loading.
     */
    public async loadRoutes(): Promise<void> {
        try {
            await this.scanDirectory(this.routesDir);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to load routes: ${errorMessage}`);
        }
    }

    /**
     * Inserts a route definition into the trie structure.
     * @param routeDef The route definition to insert, containing path, handlers, middleware, schema, and OpenAPI metadata.
     * @throws {Error} If the route definition is invalid or causes a conflict in the trie.
     */
    private insertRoute(routeDef: RouteDefinition) {
        let node = this.root;
        const segments = routeDef.path.split('/').filter(Boolean);
        for (const segment of segments) {
            if (segment.startsWith(':')) {
                // Handle dynamic segments (:param)
                if (!node.paramChild) {
                    node.paramChild = { children: new Map() };
                }
                node = node.paramChild;
                node.paramName = segment.slice(1);
            } else if (segment.startsWith('*')) {
                // Handle wildcard segments (*param)
                if (!node.wildcardChild) {
                    node.wildcardChild = { children: new Map() };
                }
                node = node.wildcardChild;
                node.isWildcard = true; // Mark as wildcard route
            } else {
                // Handle static segments
                if (!node.children.has(segment)) {
                    node.children.set(segment, { children: new Map() });
                }
                node = node.children.get(segment)!;
            }
        }
        node.route = routeDef;
    }

    /**
     * Recursively scans a directory for route modules (route.ts files) and loads them into the trie.
     * @param dir The current directory path to scan.
     * @param basePath The base path used to construct route paths from the directory structure.
     * @returns {Promise<void>} A promise that resolves when the directory scan is complete.
     * @throws {Error} If multiple dynamic folders are found at the same level or if directory access fails.
     */
    private async scanDirectory(
        dir: string,
        basePath: string = ''
    ): Promise<void> {
        // Track route types at this directory level to prevent conflicts
        let dynamicFolderFound = false;
        let wildcardFolderFound = false;

        try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const entryPath = path.join(dir, entry.name);
                const relativePath = path.join(basePath, entry.name);

                if (entry.isDirectory()) {
                    // Check if this is a dynamic or wildcard directory
                    const isDynamic =
                        entry.name.startsWith(
                            ROUTE_CONSTANTS.DYNAMIC_FOLDER_START
                        ) &&
                        entry.name.endsWith(
                            ROUTE_CONSTANTS.DYNAMIC_FOLDER_END
                        ) &&
                        entry.name !== ROUTE_CONSTANTS.WILDCARD_SIMPLE;

                    const isWildcard =
                        entry.name === ROUTE_CONSTANTS.WILDCARD_SIMPLE;

                    // Prevent conflicts between dynamic and wildcard routes
                    if (isDynamic && wildcardFolderFound) {
                        throw new Error(
                            `Cannot mix dynamic and wildcard route folders in the same directory. ` +
                                `Found dynamic folder '${entry.name}' but wildcard folder already exists in '${dir}'.`
                        );
                    }

                    if (isWildcard && dynamicFolderFound) {
                        throw new Error(
                            `Cannot mix wildcard and dynamic route folders in the same directory. ` +
                                `Found wildcard folder '${entry.name}' but dynamic folder already exists in '${dir}'.`
                        );
                    }

                    if (isDynamic && dynamicFolderFound) {
                        throw new Error(
                            `Multiple dynamic route folders found in the same directory: ` +
                                `'${entry.name}' conflicts with another dynamic folder in '${dir}'.`
                        );
                    }

                    if (isWildcard && wildcardFolderFound) {
                        throw new Error(
                            `Multiple wildcard route folders found in the same directory: ` +
                                `'${entry.name}' conflicts with another wildcard folder in '${dir}'.`
                        );
                    }

                    // Update flags
                    if (isDynamic) dynamicFolderFound = true;
                    if (isWildcard) wildcardFolderFound = true;

                    await this.scanDirectory(entryPath, relativePath);
                } else if (entry.isFile() && entry.name === 'route.ts') {
                    await this.loadRouteModule(entryPath, relativePath);
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                throw error; // Re-throw specific errors we created
            }
            throw new Error(
                `Failed to scan directory '${dir}': ${String(error)}`
            );
        }
    }

    /**
     * Loads a route module from a file and inserts it into the trie.
     * @param entryPath The full file system path to the route module (route.ts).
     * @param relativePath The relative path used to construct the route path.
     * @returns {Promise<void>} A promise that resolves when the module is loaded and inserted.
     * @throws {Error} If the route module fails to load or is invalid.
     */
    private async loadRouteModule(
        entryPath: string,
        relativePath: string
    ): Promise<void> {
        try {
            // Convert the file path to a route path
            const routePath = this.convertFilePathToRoute(relativePath);
            console.info('Loading route:', routePath);

            // Get the module path like "D:\\Projects\\src\\api\\users\\route.ts"
            const modulePath = path.resolve(entryPath);

            // Import the module
            const routeModule = await import(modulePath);

            // Variable to store the handlers for each method
            const handlers: { [method: string]: RequestHandler } = {};

            // Loop through all the HTTP methods and add the handler to the handlers object
            for (const method of HTTP_METHODS) {
                if (typeof routeModule[method] === 'function') {
                    handlers[method] = routeModule[method];
                }
            }

            const routeDef: RouteDefinition = {
                path: routePath,
                handlers,
                middleware: routeModule.middleware as Middleware[],
                schema: routeModule.schema,
                openapi: routeModule.openapi,
                isWildcard: routePath.includes(
                    ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX
                ),
            };

            this.insertRoute(routeDef);
        } catch (error) {
            throw new Error(
                `Failed to load route module '${entryPath}': ${String(error)}`
            );
        }
    }

    /**
     * Converts a file path to a route path by processing dynamic segments and wildcard segments applying the prefix.
     * @param filePath The file path to convert (e.g., "users/[id]/route.ts" , "users/[...slug]/route.ts").
     * @returns {string} The converted route path (e.g., "/users/:id" , "/users/*slug").
     */
    private convertFilePathToRoute(filePath: string): string {
        // Remove the "route.ts" suffix
        if (filePath.endsWith('route.ts')) {
            filePath = filePath.slice(0, -'route.ts'.length);
        }

        // Split path into segments
        const segments = filePath.split(path.sep);
        const resultSegments: string[] = [];

        for (let segment of segments) {
            if (!segment) continue; // Skip empty segments

            // Skip grouping segments (e.g., (group))
            if (
                segment.startsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_START) &&
                segment.endsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_END)
            ) {
                continue;
            }

            // Convert dynamic segments from [param] to :param
            if (
                segment.startsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_START) &&
                segment.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END) &&
                !segment.startsWith(ROUTE_CONSTANTS.WILDCARD_START)
            ) {
                const param = segment.slice(1, -1);

                resultSegments.push(
                    ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX + param
                );
            }
            // Convert wildcard segments from [...] to *
            else if (segment === ROUTE_CONSTANTS.WILDCARD_SIMPLE) {
                resultSegments.push(ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX);
            } else {
                resultSegments.push(segment);
            }
        }

        // Construct the route with leading slash
        let route = '/' + resultSegments.join('/');

        // Apply prefix if provided
        if (this.prefix) {
            const cleanPrefixStr = cleanPrefix(this.prefix);
            route = '/' + cleanPrefixStr + route;
        }

        // Remove trailing slash unless it's the root
        if (route !== '/' && route.endsWith('/')) {
            route = route.slice(0, -1);
        }

        return route;
    }

    /**
     * Resolves a request to a route definition and its parameters.
     * @param pathname  The normalized request pathname.
     * @param method The uppercase HTTP method.
     * @returns {{ route?: RouteDefinition; params: Record<string, string>; wildcardParams?: string[] }} An object containing the matched route (if any), extracted parameters, and wildcard segments (if applicable).
     * @throws {Error} If the request URL is malformed.
     */
    public resolve(
        pathname: string,
        method: string
    ): {
        route?: RouteDefinition;
        params: Record<string, string>;
        wildcardParams?: string[];
    } {
        try {
            const segments = pathname.split('/').filter(Boolean);
            let node = this.root;
            const params: Record<string, string> = {};
            let wildcardSegments: string[] = [];

            // Traverse the trie with proper prioritization
            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];

                // Priority 1: Exact static match (highest priority)
                if (node.children.has(segment)) {
                    node = node.children.get(segment)!;
                }
                // Priority 2: Dynamic parameter match (medium priority)
                else if (node.paramChild) {
                    node = node.paramChild;
                    params[node.paramName!] = segment;
                }
                // Priority 3: Collect remaining segments for wildcard (lowest priority)
                else {
                    wildcardSegments = segments.slice(i);
                    break;
                }
            }

            // Check if we have a route at the current node
            if (node.route?.handlers[method]) {
                return { route: node.route, params };
            }

            // If no route found but we have wildcard segments, check for wildcard route
            if (
                wildcardSegments.length > 0 &&
                node.wildcardChild?.route?.handlers[method]
            ) {
                // Return wildcard segments so they can be added to req.wildcardParams
                return {
                    route: node.wildcardChild.route,
                    params,
                    wildcardParams: wildcardSegments,
                };
            }

            return { params: {} };
        } catch (error) {
            // Log the error for better debugging
            console.error(
                `Error resolving API route for path "${pathname}":`,
                error
            );
            return { params: {} };
        }
    }
}
