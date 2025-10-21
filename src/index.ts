// Import stuff  from core
import { Server } from '@core/server.js';
import { ApiRouter } from '@core/api-router.js';
import { PageRouter } from '@core/page-router.js';
import { generateOpenAPIDocument } from '@core/openapi.js';
import { swaggerHtml } from '@core/swagger-ui.js';

// Import utils
import { collectRoutes } from '@utils';
import { METHOD_NOT_ALLOWED, NOT_FOUND, OPENAPI_ERROR } from '@utils/response';

// Import middleware
import { createValidationMiddleware } from '@middleware/validator.js';

// Import types
import type {
    ServerOptions,
    Middleware,
    BurgerRequest,
    RequestHandler,
} from '@burgerTypes';
import type { HTMLBundle } from 'bun';

export class Burger {
    /**
     * The server instance
     */
    private server: Server;

    /**
     * The API router instance
     */
    private apiRouter?: ApiRouter;

    /**
     * The page router instance
     */
    private pageRouter?: PageRouter;

    /**
     * The global middleware
     */
    private globalMiddleware: Middleware[] = [];

    /**
     * The OpenAPI document
     */
    private openApiDoc: any = null;

    /**
     * The routes object
     */
    private routes: {
        [key: string]: HTMLBundle | RequestHandler;
    } = {};

    /**
     * Pre-computed responses for reuse
     */
    private readonly METHOD_NOT_ALLOWED = METHOD_NOT_ALLOWED;

    /**
     * The not found response
     */
    private readonly NOT_FOUND = NOT_FOUND;

    /**
     * The OpenAPI error response
     */
    private readonly OPENAPI_ERROR = OPENAPI_ERROR;

    /**
     * Constructor for the Burger class.
     * @param options - The options for the server and router.
     * The options object should contain the following properties:
     * - port: The port number to listen on.
     * - apiDir: The directory path to load API routes from.
     * - pageDir: The directory path to load page routes from.
     * - middleware: An array of global middleware functions.
     */
    constructor(private options: ServerOptions) {
        // Create server instance
        this.server = new Server(options);

        // Fast initialization for routers with nullish coalescing
        const { apiDir, pageDir, apiPrefix, pagePrefix, globalMiddleware } =
            options;

        // Initialize API router if apiDir is provided
        this.apiRouter = apiDir
            ? new ApiRouter(apiDir, apiPrefix || 'api')
            : undefined;

        // Initialize page router if pageDir is provided
        this.pageRouter = pageDir
            ? new PageRouter(pageDir, pagePrefix || '')
            : undefined;

        // Add global middleware if any
        this.globalMiddleware = globalMiddleware?.length
            ? globalMiddleware.slice()
            : [];
    }

    /**
     * Process the page routes and add them to the routes object
     * @returns A promise that resolves to a boolean
     */
    private async processPageRoutes(): Promise<boolean> {
        // If no page router, return false
        if (!this.pageRouter) return false;

        // Load pages routes
        await this.pageRouter.loadPages();
        // If there are any page routes, add them to the routes object
        const pages = this.pageRouter.pages;
        // Get the length of the pages routes
        const pageCount = pages.length;
        // If no pages, return false
        if (pageCount === 0) return false;

        // Loop through the pages
        for (let i = 0; i < pageCount; i++) {
            // Get the current page
            const page = pages[i];
            // Add the page to the routes
            this.routes[page.path] = page.handler;
        }

        // Return true if there are any pages
        return true;
    }

    /**
     * Process the API routes and add them to the routes object
     * @returns A promise that resolves to a boolean
     */
    private async processApiRoutes(): Promise<boolean> {
        // If no api router, return false
        if (!this.apiRouter) return false;

        // Load API routes
        await this.apiRouter.loadRoutes();

        // Collect API routes
        const apiRoutes = collectRoutes(this.apiRouter.routes);

        // Get the length of the API routes
        const routeCount = apiRoutes.length;

        // If there are no API routes, return false
        if (routeCount === 0) return false;

        // Generate OpenAPI document and cache it
        this.openApiDoc = generateOpenAPIDocument(apiRoutes, this.options);

        // Cache frequently accessed properties
        const routes = this.routes;
        // Get the global middleware
        const globalMiddleware = this.globalMiddleware;
        // Get the length of the global middleware
        const globalMiddlewareLen = globalMiddleware.length;

        // Process each route with optimized handler creation
        for (let i = 0; i < routeCount; i++) {
            /**
             * ================================================
             * Pre-compute the required functionality start
             * ================================================
             */

            // Get the current route object
            const route = apiRoutes[i];

            // Destructure the route object
            const {
                path,
                schema,
                middleware: routeMiddleware,
                handlers,
            } = route;

            // Get length of route specific middleware
            const routeMiddlewareLen = routeMiddleware?.length || 0;

            // Check if schema exists
            const hasSchema = !!schema;

            // Optimize middleware array initialization by pre-allocating size
            const totalMiddlewareCount =
                globalMiddlewareLen + (hasSchema ? 1 : 0) + routeMiddlewareLen;

            // Create optimized route handler
            if (totalMiddlewareCount === 0) {
                // Ultra-fast path: no middleware
                // Pre-compute wildcard segment count for faster extraction
                const isWildcard = route.isWildcard;
                // Calculate how many segments come before the wildcard
                // E.g., "/api/users/:userId/*" has 3 segments before wildcard (api, users, :userId)
                const baseSegmentCount = isWildcard
                    ? path.split('/').filter(Boolean).length - 1 // Subtract 1 for the * itself
                    : 0;

                routes[path] = (request: BurgerRequest) => {
                    // Extract wildcard params if this is a wildcard route
                    if (isWildcard) {
                        // Step 1: Get the pathname from the URL
                        // Example: "http://localhost:4000/api/users/123/profile?id=1" → "/api/users/123/profile"
                        const url = request.url;

                        // Find where the path starts (after protocol and domain)
                        // Example: "http://localhost:4000/api/..." → protocolEnd = 4 (after "http")
                        const protocolEnd = url.indexOf('://');

                        // Find first "/" after the domain
                        // Example: "http://localhost:4000/api/..." → pathStart = 21 (the "/" before "api")
                        const pathStart = url.indexOf('/', protocolEnd + 3);

                        // Find where query parameters start (if any)
                        // Example: "/api/users/123?id=1" → pathEnd = 15 (at the "?")
                        const pathEnd = url.indexOf('?', pathStart);

                        // Extract just the pathname without query parameters
                        // Example: "/api/users/123/profile"
                        const pathname =
                            pathEnd === -1
                                ? url.substring(pathStart) // No query params
                                : url.substring(pathStart, pathEnd); // Has query params, stop at "?"

                        // Step 2: Extract wildcard segments efficiently
                        // Example route: "/api/users/:userId/*" has baseSegmentCount = 3
                        //   - Segment 0: "api"
                        //   - Segment 1: "users"
                        //   - Segment 2: ":userId" (or "123" in actual URL)
                        //   - Segment 3+: wildcard segments we want!

                        if (baseSegmentCount === 0) {
                            // Fast path: The entire path is wildcard
                            // Example: "/api/docs/*" where all segments after domain are wildcards
                            // Just split everything and we're done!
                            request.wildcardParams = pathname
                                .split('/')
                                .filter(Boolean);
                        } else {
                            // Optimized path: Skip base segments and only collect wildcard segments
                            // Example: "/api/users/123/settings/privacy"
                            //   - We need to skip 3 segments (api, users, 123)
                            //   - Only collect: ["settings", "privacy"]

                            const wildcardParams: string[] = [];
                            let segmentCount = 0; // Counts how many segments we've seen
                            let start = pathname[0] === '/' ? 1 : 0; // Start after leading "/" if present

                            // Loop through each character in the pathname
                            // When we hit "/" or end of string, we know we found a segment
                            for (let i = start; i <= pathname.length; i++) {
                                // Found end of a segment (either "/" or end of string)
                                if (
                                    i === pathname.length ||
                                    pathname[i] === '/'
                                ) {
                                    // Make sure it's not an empty segment (from double slashes)
                                    if (i > start) {
                                        // Only save segments AFTER we've skipped the base segments
                                        // Example: If baseSegmentCount=3, save segment 3, 4, 5, etc.
                                        if (segmentCount >= baseSegmentCount) {
                                            // Extract this segment from the pathname
                                            // Example: pathname.substring(5, 13) might give "settings"
                                            wildcardParams.push(
                                                pathname.substring(start, i)
                                            );
                                        }
                                        segmentCount++; // Increment count for next segment
                                    }
                                    start = i + 1; // Move start position to character after "/"
                                }
                            }

                            // Done! wildcardParams now contains only the wildcard segments
                            // Example: ["settings", "privacy"] instead of ["api", "users", "123", "settings", "privacy"]
                            request.wildcardParams = wildcardParams;
                        }
                    }

                    const handler = handlers[request.method];
                    return handler ? handler(request) : this.METHOD_NOT_ALLOWED;
                };
            } else {
                // Pre-compute middleware array with known size
                const middlewares = new Array<Middleware>(totalMiddlewareCount);

                // Initialize index to track the current middleware
                let index = 0;

                // Copy global middleware (most common case)
                for (let j = 0; j < globalMiddlewareLen; j++) {
                    middlewares[index++] = globalMiddleware[j];
                }

                // Add validation middleware if needed
                if (hasSchema) {
                    middlewares[index++] = createValidationMiddleware(schema);
                }

                // Add route-specific middlewares
                if (routeMiddleware) {
                    for (let j = 0; j < routeMiddlewareLen; j++) {
                        middlewares[index++] = routeMiddleware[j];
                    }
                }

                /**
                 * ================================================
                 * Pre-compute the required functionality end
                 * ================================================
                 */

                // Pre-compute wildcard segment count for faster extraction
                const isWildcard = route.isWildcard;
                // Calculate how many segments come before the wildcard
                // E.g., "/api/users/:userId/*" has 3 segments before wildcard (api, users, :userId)
                const baseSegmentCount = isWildcard
                    ? path.split('/').filter(Boolean).length - 1 // Subtract 1 for the * itself
                    : 0;

                // Create handler with middleware
                routes[path] = (request: BurgerRequest) => {
                    // Extract wildcard params if this is a wildcard route
                    if (isWildcard) {
                        // Step 1: Get the pathname from the URL
                        // Example: "http://localhost:4000/api/users/123/profile?id=1" → "/api/users/123/profile"
                        const url = request.url;

                        // Find where the path starts (after protocol and domain)
                        // Example: "http://localhost:4000/api/..." → protocolEnd = 4 (after "http")
                        const protocolEnd = url.indexOf('://');

                        // Find first "/" after the domain
                        // Example: "http://localhost:4000/api/..." → pathStart = 21 (the "/" before "api")
                        const pathStart = url.indexOf('/', protocolEnd + 3);

                        // Find where query parameters start (if any)
                        // Example: "/api/users/123?id=1" → pathEnd = 15 (at the "?")
                        const pathEnd = url.indexOf('?', pathStart);

                        // Extract just the pathname without query parameters
                        // Example: "/api/users/123/profile"
                        const pathname =
                            pathEnd === -1
                                ? url.substring(pathStart) // No query params
                                : url.substring(pathStart, pathEnd); // Has query params, stop at "?"

                        // Step 2: Extract wildcard segments efficiently
                        // Example route: "/api/users/:userId/*" has baseSegmentCount = 3
                        //   - Segment 0: "api"
                        //   - Segment 1: "users"
                        //   - Segment 2: ":userId" (or "123" in actual URL)
                        //   - Segment 3+: wildcard segments we want!

                        if (baseSegmentCount === 0) {
                            // Fast path: The entire path is wildcard
                            // Example: "/api/docs/*" where all segments after domain are wildcards
                            // Just split everything and we're done!
                            request.wildcardParams = pathname
                                .split('/')
                                .filter(Boolean);
                        } else {
                            // Optimized path: Skip base segments and only collect wildcard segments
                            // Example: "/api/users/123/settings/privacy"
                            //   - We need to skip 3 segments (api, users, 123)
                            //   - Only collect: ["settings", "privacy"]

                            const wildcardParams: string[] = [];
                            let segmentCount = 0; // Counts how many segments we've seen
                            let start = pathname[0] === '/' ? 1 : 0; // Start after leading "/" if present

                            // Loop through each character in the pathname
                            // When we hit "/" or end of string, we know we found a segment
                            for (let i = start; i <= pathname.length; i++) {
                                // Found end of a segment (either "/" or end of string)
                                if (
                                    i === pathname.length ||
                                    pathname[i] === '/'
                                ) {
                                    // Make sure it's not an empty segment (from double slashes)
                                    if (i > start) {
                                        // Only save segments AFTER we've skipped the base segments
                                        // Example: If baseSegmentCount=3, save segment 3, 4, 5, etc.
                                        if (segmentCount >= baseSegmentCount) {
                                            // Extract this segment from the pathname
                                            // Example: pathname.substring(5, 13) might give "settings"
                                            wildcardParams.push(
                                                pathname.substring(start, i)
                                            );
                                        }
                                        segmentCount++; // Increment count for next segment
                                    }
                                    start = i + 1; // Move start position to character after "/"
                                }
                            }

                            // Done! wildcardParams now contains only the wildcard segments
                            // Example: ["settings", "privacy"] instead of ["api", "users", "123", "settings", "privacy"]
                            request.wildcardParams = wildcardParams;
                        }
                    }

                    const handler = handlers[request.method];
                    if (!handler) return this.METHOD_NOT_ALLOWED;

                    return this.processMiddleware(
                        request,
                        middlewares,
                        handler
                    );
                };
            }

            // For wildcard routes, also register the base path
            // Bun's /* wildcard may not match the base path itself, so we register both
            if (route.isWildcard && path.endsWith('/*')) {
                const basePath = path.slice(0, -2); // Remove "/*" to get base path

                // Only register base path if no static route exists (preserve priority)
                // Static routes have highest priority: Static > Dynamic > Wildcard
                if (!routes[basePath]) {
                    // No static route found, register wildcard for base path
                    routes[basePath] = routes[path];
                }
                // If static route exists, it takes priority (correct behavior)
            }
        }

        // Add special routes for OpenAPI
        routes['/openapi.json'] = () =>
            this.openApiDoc
                ? Response.json(this.openApiDoc)
                : this.OPENAPI_ERROR;

        // Add special route for Swagger UI
        routes['/docs'] = () =>
            new Response(swaggerHtml, {
                headers: { 'Content-Type': 'text/html' },
            });

        return true;
    }

    /**
     * Process the middleware and handler
     * @param request - The request object
     * @param middlewares - The middleware array
     * @param handler - The handler function
     * @returns A promise that resolves to a response
     */
    private async processMiddleware(
        request: BurgerRequest,
        middlewares: Middleware[],
        handler: RequestHandler
    ): Promise<Response> {
        // Get the length of the middleware array
        const middlewareLen = middlewares.length;

        // Fast path: single middleware with no after functions
        if (middlewareLen === 1) {
            // Get the first middleware
            const result = await middlewares[0](request);
            // If the result is a response, return it
            if (result instanceof Response) {
                return result;
            }
            // If the result is not a function, return the handler
            if (typeof result !== 'function') {
                return handler(request);
            }
            // If the result is a function, return the result of the handler
            return result(await handler(request));
        }

        // Stack to store "after" functions
        // Regular path with pre-allocated afterStack
        const afterStack = new Array<(response: Response) => Promise<Response>>(
            middlewareLen
        );

        // Initialize the after middleware counter
        let afterCount = 0;

        // Process "before" logic
        for (let i = 0; i < middlewareLen; i++) {
            // Get the current middleware
            const result = await middlewares[i](request);

            // If the result is a response, return it
            if (result instanceof Response) {
                return result; // Short-circuit with a response
            }
            // If the result is a function, save it to the afterStack
            else if (typeof result === 'function') {
                afterStack[afterCount++] = result;
            }
            // If undefined, proceed to next middleware
        }

        // Get response from handler
        let response = await handler(request);

        // Fast path: no after functions
        if (afterCount === 0) {
            return response;
        }

        // Fast path: single after function
        if (afterCount === 1) {
            return afterStack[0](response);
        }

        // Process "after" logic in reverse order
        for (let i = afterCount - 1; i >= 0; i--) {
            response = await afterStack[i](response);
        }

        // Return the response
        return response;
    }

    /**
     * Starts the server and begins listening for incoming requests.
     * @param port - The port number to listen on. Defaults to `4000`.
     * @param cb - An optional cb function to be executed when the server is listening.
     * @returns A Promise that resolves when the server has started listening.
     */
    public async serve(port: number = 4000, cb?: () => void): Promise<void> {
        // Process routes in parallel if possible
        const [pagesConfigured, apiConfigured] = await Promise.all([
            this.processPageRoutes(),
            this.processApiRoutes(),
        ]);

        // Flag to track if any routes were loaded
        const routesConfigured = pagesConfigured || apiConfigured;

        // If routes were configured, start the server
        if (routesConfigured) {
            // Start the server
            this.server.start(
                this.routes,
                async () => {
                    return this.NOT_FOUND;
                },
                port,
                cb
            );
        } else {
            // If no routes were configured, log an error
            console.error(
                'Error: No routes configured! Please provide either apiDir with route.ts files or pageDir with html files when initializing the Burger Class.'
            );
        }
    }
}

// Export utils
export { setDir } from '@utils';

// Export types
export type {
    ServerOptions,
    RequestHandler,
    BurgerRequest,
    BurgerNext,
    Middleware,
    openapi,
} from '@burgerTypes';
