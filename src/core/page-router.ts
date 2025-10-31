// Import stuff from node
import { readdirSync } from 'fs';
import * as path from 'path';

// Import utils
import {
    cleanPrefix,
    normalizePath,
    compareRoutes,
    ROUTE_CONSTANTS,
} from '../utils/index';

// Import types
import type { PageDefinition } from '../types/index';

/**
 * PageRouter class for handling file-based page routing.
 * Loads pages from a directory structure and matches requests to the appropriate page handlers.
 * Supports dynamic segments (e.g., [id]) and uses default exports as page handlers.
 */
export class PageRouter {
    /** Array of loaded page definitions */
    public pages: PageDefinition[] = [];

    /**
     * Constructor for the PageRouter class.
     * @param pagesDir The directory path where page modules are located.
     * @param prefix Optional prefix to prepend to all routes (e.g., "pages" becomes "/pages/...").
     */
    constructor(private pagesDir: string, private prefix: string = '') {
        if (!pagesDir) {
            throw new Error('Pages directory path must be provided');
        }

        // Normalize the pagesDir path
        this.pagesDir = path.normalize(pagesDir);

        // Normalize the prefix if provided
        if (prefix) {
            this.prefix = cleanPrefix(prefix);
        }
    }

    /**
     * Loads page modules from the specified directory and adds them to the pages array.
     * After loading, sorts the pages to prioritize static routes over dynamic ones based on specificity.
     * @returns A promise that resolves when all page modules have been loaded and sorted.
     */
    public async loadPages(): Promise<void> {
        // Clear the pages array
        this.pages = [];
        try {
            await this.scanDirectory(this.pagesDir);
            // Sort pages to ensure static routes are matched before dynamic ones
            this.pages.sort((a, b) => compareRoutes(a, b));
        } catch (error) {
            console.error('Failed to load pages:', error);
            throw new Error(
                `Failed to load pages: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    /**
     * Recursively scans the directory for page modules and adds them to the pages array.
     * @param dir The current directory to scan.
     * @param basePath The base path for constructing the route path.
     */
    private async scanDirectory(
        dir: string,
        basePath: string = ''
    ): Promise<void> {
        // Track if a dynamic folder has been found at this directory level
        let dynamicFolderFound = false;

        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const entryPath = path.join(dir, entry.name);
                const relativePath = path.join(basePath, entry.name);

                if (entry.isDirectory()) {
                    // Handle dynamic directories (e.g., [id])
                    if (
                        entry.name.startsWith(
                            ROUTE_CONSTANTS.DYNAMIC_FOLDER_START
                        ) &&
                        entry.name.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END)
                    ) {
                        if (dynamicFolderFound) {
                            throw new Error(
                                `Multiple dynamic page folders found in the same directory: '${entry.name}' conflicts with another dynamic folder.`
                            );
                        }
                        dynamicFolderFound = true;
                    }
                    await this.scanDirectory(entryPath, relativePath);
                } else if (
                    entry.isFile() &&
                    ROUTE_CONSTANTS.SUPPORTED_PAGE_EXTENSIONS.some((ext) =>
                        entry.name.endsWith(ext)
                    )
                ) {
                    // Convert file path to route path and load the module
                    const routePath = this.convertFilePathToRoute(relativePath);
                    // Clean the route path
                    const cleanedRoutePath = this.cleanRoutePath(routePath);

                    // Get the module path
                    const modulePath = path.resolve(entryPath);

                    try {
                        // Import the module
                        const pageModule = await import(modulePath);

                        // Get the default export as the page handler
                        if (
                            entry.name.endsWith('.tsx') &&
                            typeof pageModule.default !== 'function'
                        ) {
                            throw new Error(
                                `Page at ${entryPath} must export a default function as its handler.`
                            );
                        }

                        // Create page definition
                        const pageDefWithSlash: PageDefinition = {
                            path: cleanedRoutePath + '/',
                            handler: pageModule.default,
                            middleware: pageModule.middleware,
                        };

                        // Create page definition
                        const pageDef: PageDefinition = {
                            path: cleanedRoutePath,
                            handler: pageModule.default,
                            middleware: pageModule.middleware,
                        };

                        // Add the page definition to the pages array
                        this.pages.push(pageDefWithSlash, pageDef);
                    } catch (importError) {
                        console.error(
                            `Failed to import module at ${modulePath}:`,
                            importError
                        );
                    }
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dir}:`, error);
            throw error;
        }
    }

    /**
     * Converts a file path to a route path by processing dynamic segments,
     * removing certain directory indicators, and applying a prefix if specified.
     * @param filePath The file path to convert into a route path.
     * @returns The converted route path string (before extension cleaning).
     */
    private convertFilePathToRoute(filePath: string): string {
        // Split path into segments
        const segments = filePath.split(path.sep);
        const resultSegments: string[] = [];

        for (let segment of segments) {
            if (!segment) continue; // Skip empty segments

            // Skip grouping segments (e.g., (group))
            if (
                segment.startsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_START) &&
                segment.endsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_END)
            )
                continue;

            // Convert dynamic segments from [param] to :param
            if (
                segment.startsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_START) &&
                segment.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END)
            ) {
                const param = segment.slice(1, -1);
                resultSegments.push(
                    ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX + param
                );
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
     * Cleans a route path by handling index files and removing extensions.
     * @param routePath The route path to clean
     * @returns The cleaned route path
     */
    private cleanRoutePath(routePath: string): string {
        // Break the route path into segments
        const pathSegments = routePath.split('/');

        // Get the last segment
        if (pathSegments.length > 0) {
            const lastSegment = pathSegments[pathSegments.length - 1];

            // Check if the last segment is an index file
            if (ROUTE_CONSTANTS.PAGE_INDEX_FILES.includes(lastSegment)) {
                // Remove the last segment for index files
                pathSegments.pop();
            } else {
                // Remove file extension for non-index files
                const extensionIndex = lastSegment.lastIndexOf('.');
                if (extensionIndex > 0) {
                    pathSegments[pathSegments.length - 1] =
                        lastSegment.substring(0, extensionIndex);
                }
            }
        }

        // Join the segments back together
        const finalPath =
            pathSegments.join('/') === '' ? '/' : pathSegments.join('/');

        return finalPath;
    }

    /**
     * Resolves the given request by finding a matching page and extracting dynamic parameters.
     * @param request The request to resolve.
     * @returns An object containing the matched page and parameters, or an empty params object if no match.
     */
    public resolve(request: Request): {
        page?: PageDefinition;
        params: Record<string, string>;
    } {
        const url = new URL(request.url);
        const reqPath = normalizePath(url.pathname);

        console.debug(`Resolving route for path: ${reqPath}`);

        for (const page of this.pages) {
            const match = this.matchRoute(reqPath, page.path);
            if (match) {
                console.debug(
                    `Route matched: ${page.path} with params:`,
                    match
                );
                return { page, params: match };
            }
        }

        console.debug(`No matching route found for path: ${reqPath}`);
        return { params: {} };
    }

    /**
     * Checks if the request path matches the page path, extracting dynamic parameters if matched.
     * @param requestPath The request path to check.
     * @param pagePath The page path to match against.
     * @returns A record of dynamic parameters if matched, otherwise null.
     */
    private matchRoute(
        requestPath: string,
        pagePath: string
    ): Record<string, string> | null {
        const reqSegments = requestPath.split('/').filter(Boolean);
        const pageSegments = pagePath.split('/').filter(Boolean);

        if (reqSegments.length !== pageSegments.length) {
            return null;
        }

        const params: Record<string, string> = {};
        for (let i = 0; i < reqSegments.length; i++) {
            const pSegment = pageSegments[i];
            const reqSegment = reqSegments[i];

            if (pSegment.startsWith(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX)) {
                const paramName = pSegment.slice(
                    ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX.length
                );
                params[paramName] = reqSegment;
            } else if (pSegment !== reqSegment) {
                return null;
            }
        }
        return params;
    }
}
