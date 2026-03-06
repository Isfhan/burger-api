// Import stuff  from core
import { Server } from './core/server';
import { ApiRouter } from './core/api-router';
import { PageRouter } from './core/page-router';
import { generateOpenAPIDocument } from './core/openapi';
import { swaggerHtml } from './core/swagger-ui';

// Import utils
import { collectRoutes } from './utils/index';
import { METHOD_NOT_ALLOWED, NOT_FOUND, OPENAPI_ERROR } from './utils/response';
import {
    extractPathnameFromUrl,
    extractWildcardParams,
} from './utils/wildcard';

// Import middleware
import { createValidationMiddleware } from './middleware/validator';

// Import types
import type {
    ServerOptions,
    Middleware,
    BurgerRequest,
    RequestHandler,
    RouteDefinition,
} from './types/index';
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

        // Initialize API router only when using runtime scanning (no prebuilt apiRoutes)
        this.apiRouter =
            apiDir && !options.apiRoutes?.length
                ? new ApiRouter(apiDir, apiPrefix || 'api')
                : undefined;

        // Initialize page router only when using runtime scanning (no prebuilt pageRoutes)
        this.pageRouter =
            pageDir && !options.pageRoutes?.length
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
        // Production path: use pre-built page routes (no filesystem scan)
        const prebuiltPages = this.options.pageRoutes;
        if (prebuiltPages?.length) {
            for (let i = 0; i < prebuiltPages.length; i++) {
                const page = prebuiltPages[i];
                this.routes[page.path] = page.handler;
            }
            return true;
        }

        // Dev path: load from filesystem via PageRouter
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
        // Production path: use pre-built API routes (no filesystem scan)
        let apiRoutes: RouteDefinition[];
        if (this.options.apiRoutes?.length) {
            apiRoutes = this.options.apiRoutes;
        } else {
            // Dev path: load from filesystem via ApiRouter
            if (!this.apiRouter) return false;
            await this.apiRouter.loadRoutes();
            apiRoutes = collectRoutes(this.apiRouter.routes);
        }

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

            // Pre-compute wildcard info once (used in all paths)
            const isWildcard = route.isWildcard;
            const baseSegmentCount = isWildcard
                ? path.split('/').filter(Boolean).length - 1
                : 0;

            // Create optimized route handler based on middleware count
            if (totalMiddlewareCount === 0) {
                // Ultra-fast path: no middleware at all
                // Inline everything for maximum speed
                if (isWildcard) {
                    // Wildcard route with no middleware
                    routes[path] = (request: BurgerRequest) => {
                        const pathname = extractPathnameFromUrl(request.url);
                        extractWildcardParams(
                            request,
                            pathname,
                            baseSegmentCount
                        );
                        const handler = handlers[request.method];
                        return handler
                            ? handler(request)
                            : this.METHOD_NOT_ALLOWED;
                    };
                } else {
                    // Regular route with no middleware (most common case)
                    routes[path] = (request: BurgerRequest) => {
                        const handler = handlers[request.method];
                        return handler
                            ? handler(request)
                            : this.METHOD_NOT_ALLOWED;
                    };
                }
            } else {
                // Pre-compute middleware array with exact size (AOT optimization)
                const middlewares = new Array<Middleware>(totalMiddlewareCount);
                let idx = 0;

                // Copy global middleware (manual loop is faster than spread/concat)
                for (let j = 0; j < globalMiddlewareLen; j++) {
                    middlewares[idx++] = globalMiddleware[j];
                }

                // Add validation middleware if needed
                if (hasSchema) {
                    middlewares[idx++] = createValidationMiddleware(schema);
                }

                // Add route-specific middlewares
                if (routeMiddleware) {
                    for (let j = 0; j < routeMiddlewareLen; j++) {
                        middlewares[idx++] = routeMiddleware[j];
                    }
                }

                // Create specialized handler based on middleware count
                if (totalMiddlewareCount === 1) {
                    // Single middleware fast path (common: just CORS or just auth)
                    const singleMiddleware = middlewares[0];

                    if (isWildcard) {
                        routes[path] = (request: BurgerRequest) => {
                            const pathname = extractPathnameFromUrl(
                                request.url
                            );
                            extractWildcardParams(
                                request,
                                pathname,
                                baseSegmentCount
                            );
                            const handler = handlers[request.method];
                            if (!handler) return this.METHOD_NOT_ALLOWED;
                            return this.processSingleMiddleware(
                                request,
                                singleMiddleware,
                                handler
                            );
                        };
                    } else {
                        routes[path] = (request: BurgerRequest) => {
                            const handler = handlers[request.method];
                            if (!handler) return this.METHOD_NOT_ALLOWED;
                            return this.processSingleMiddleware(
                                request,
                                singleMiddleware,
                                handler
                            );
                        };
                    }
                } else {
                    // Multiple middlewares (general case)
                    if (isWildcard) {
                        routes[path] = (request: BurgerRequest) => {
                            const pathname = extractPathnameFromUrl(
                                request.url
                            );
                            extractWildcardParams(
                                request,
                                pathname,
                                baseSegmentCount
                            );
                            const handler = handlers[request.method];
                            if (!handler) return this.METHOD_NOT_ALLOWED;
                            return this.processMiddleware(
                                request,
                                middlewares,
                                handler
                            );
                        };
                    } else {
                        routes[path] = (request: BurgerRequest) => {
                            const handler = handlers[request.method];
                            if (!handler) return this.METHOD_NOT_ALLOWED;
                            return this.processMiddleware(
                                request,
                                middlewares,
                                handler
                            );
                        };
                    }
                }
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
     * Process single middleware
     * @param request - The request object
     * @param middleware - The middleware function
     * @param handler - The handler function
     * @returns A promise that resolves to a response
     */
    private async processSingleMiddleware(
        request: BurgerRequest,
        middleware: Middleware,
        handler: RequestHandler
    ): Promise<Response> {
        const result = await middleware(request);

        // Short-circuit with Response
        if (result instanceof Response) {
            return result;
        }

        // Transform response after handler
        if (typeof result === 'function') {
            return result(await handler(request));
        }

        // Continue to handler
        return handler(request);
    }

    /**
     * Process middleware and handler
     *
     * How it works:
     * 1. Run each middleware in order
     * 2. If middleware returns Response → stop and send that response (but still apply "after" functions)
     * 3. If middleware returns undefined → continue to next middleware
     * 4. If middleware returns function → save it to transform the final response later
     * 5. After all middlewares, run the handler
     * 6. Apply all saved "after" functions to the response (in reverse order)
     *
     * Performance optimizations:
     * - Pre-allocated array for "after" functions (avoids dynamic resizing)
     * - Fast paths for 0, 1, and 2 middlewares (most common cases)
     * - Manual loop unrolling for small counts
     * - Minimal branching in hot path
     */
    private async processMiddleware(
        request: BurgerRequest,
        middlewares: Middleware[],
        handler: RequestHandler
    ): Promise<Response> {
        const len = middlewares.length;

        // Fast path: two middlewares (common: CORS + logger, or auth + logger)
        if (len === 2) {
            // First middleware
            const result1 = await middlewares[0](request);
            if (result1 instanceof Response) {
                return result1;
            }

            // Second middleware
            const result2 = await middlewares[1](request);
            if (result2 instanceof Response) {
                // Apply first middleware's after function if exists
                if (typeof result1 === 'function') {
                    return result1(result2);
                }
                return result2;
            }

            // Run handler
            let response = await handler(request);

            // Apply after functions in reverse order (manual unroll)
            if (typeof result2 === 'function') {
                response = await result2(response);
            }
            if (typeof result1 === 'function') {
                response = await result1(response);
            }

            return response;
        }

        // General path: 3+ middlewares (less common)
        // Pre-allocate array with exact size to avoid dynamic resizing
        const afterStack = new Array(len);
        let afterCount = 0;

        // Run each middleware
        for (let i = 0; i < len; i++) {
            const result = await middlewares[i](request);

            // Short-circuit with Response (check first - most common early exit)
            if (result instanceof Response) {
                // Apply collected "after" functions in reverse
                if (afterCount === 0) return result;
                if (afterCount === 1) return afterStack[0](result);

                // Multiple after functions
                let response = result;
                for (let j = afterCount - 1; j >= 0; j--) {
                    response = await afterStack[j](response);
                }
                return response;
            }

            // Save function for later (check once, no double typeof check)
            if (typeof result === 'function') {
                afterStack[afterCount++] = result;
            }

            // undefined - continue (implicit, no check needed)
        }

        // All middlewares passed - run handler
        let response = await handler(request);

        // Apply "after" functions in reverse order
        // Fast paths for common cases
        if (afterCount === 0) return response;
        if (afterCount === 1) return afterStack[0](response);
        if (afterCount === 2) {
            response = await afterStack[1](response);
            return afterStack[0](response);
        }

        // General case: 3+ after functions
        for (let i = afterCount - 1; i >= 0; i--) {
            response = await afterStack[i](response);
        }

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
                'Error: No routes configured! Please provide apiDir/pageDir (for dev) or apiRoutes/pageRoutes (for production builds) when initializing the Burger class.'
            );
        }
    }
}

// Export utils
export { setDir } from './utils/index';

// Export types
export type {
    ServerOptions,
    RequestHandler,
    BurgerRequest,
    BurgerNext,
    Middleware,
    openapi,
    RouteDefinition,
    PageDefinition,
} from './types/index';
