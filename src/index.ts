// Import stuff  from core
import { Server } from '@core/server.js';
import { ApiRouter } from '@core/api-router.js';
import { PageRouter } from '@core/page-router.js';
import { generateOpenAPIDocument } from '@core/openapi.js';
import { swaggerHtml } from '@core/swagger-ui.js';

// Import middleware
import { createValidationMiddleware } from '@middleware/validator.js';

// Import types
import type {
    ServerOptions,
    Middleware,
    BurgerRequest,
    BurgerResponse,
    BurgerNext,
    RequestHandler,
} from '@burgerTypes';
import type { HTMLBundle } from 'bun';
import { normalizePath } from '@utils';
import { CreateLoggingMiddleware } from '@middleware/logger.js';

export class Burger {
    private server: Server;
    private apiRouter?: ApiRouter;
    private pageRouter?: PageRouter;
    private globalMiddleware: Middleware[] = [];

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
        this.server = new Server(options);
        // Initialize API router
        if (options.apiDir) {
            this.apiRouter = new ApiRouter(options.apiDir, 'api');
        }

        // Initialize page router
        if (options.pageDir) {
            this.pageRouter = new PageRouter(options.pageDir, '');
        }

        // Add global middleware
        if (options.globalMiddleware) {
            options.globalMiddleware.forEach((mw) =>
                this.addGlobalMiddleware(mw)
            );
        }
    }

    /**
     * Adds a global middleware function to the list of middlewares.
     * @param mw - The middleware function to add.
     */
    addGlobalMiddleware(mw: Middleware) {
        this.globalMiddleware.push(mw);
    }

    /**
     * Starts the server and begins listening for incoming requests.
     * @param port - The port number to listen on. Defaults to `4000`.
     * @param cb - An optional cb function to be executed when the server is listening.
     * @returns A Promise that resolves when the server has started listening.
     */
    async serve(port: number = 4000, cb?: () => void): Promise<void> {
        // File-based routing mode
        const routes: { [key: string]: HTMLBundle | RequestHandler } = {};

        // Handle page routes
        if (this.pageRouter) {
            // Load Page routes
            await this.pageRouter.loadPages();
            // If there are any page routes, add them to the routes object
            if (this.pageRouter.pages.length > 0) {
                this.pageRouter.pages.forEach((page) => {
                    routes[page.path] = page.handler;
                });
            }
        }

        if (this.apiRouter) {
            // Load API routes
            await this.apiRouter.loadRoutes();

            // Start the server
            this.server.start(
                routes,
                async (req: BurgerRequest, res: BurgerResponse) => {
                    // Create URL object
                    const url = new URL(req.url);
                    const pathname = url.pathname; // Use pre-extracted pathname
                    const method = req.method.toUpperCase(); // Use pre-extracted method
                    // Check if the request is for /openapi.json
                    if (pathname === '/openapi.json') {
                        if (this.apiRouter) {
                            // Generate OpenAPI document
                            const doc = generateOpenAPIDocument(
                                this.apiRouter,
                                this.options
                            );
                            // Return it as JSON
                            return res.json(doc);
                        } else {
                            // Return a descriptive error if router is not available
                            return res.status(500).json({
                                error: 'API Router not configured',
                                message:
                                    'Please provide an apiDir option when initializing the Burger instance to enable OpenAPI documentation.',
                            });
                        }
                    }

                    // Serve the Swagger UI at /docs
                    if (pathname === '/docs') {
                        return res.html(swaggerHtml);
                    }

                    // Normalize the pathname to ensure it's in the correct format
                    const normalizedPathname = normalizePath(pathname);

                    // Get the route and params for the current request
                    const { route, params } = this.apiRouter!.resolve(
                        normalizedPathname,
                        method
                    );

                    if (!route) {
                        // Return a 404 if no route is found
                        return res
                            .status(404)
                            .json({ error: 'Route not found' });
                    }

                    // Add params to the request
                    req.params = params;

                    // Get the handler for the current HTTP method

                    const handler = route.handlers[method];
                    if (!handler) {
                        // Return a 405 if no handler is found
                        return res
                            .status(405)
                            .json({ error: 'Method Not Allowed' });
                    }

                    // Create a new array to store the middleware chain
                    const middlewaresToRun: Middleware[] = [
                        // Global middleware first
                        ...this.globalMiddleware,
                        ...[CreateLoggingMiddleware()],
                        // Validation middleware next (if schema exists)
                        ...(route.schema
                            ? [createValidationMiddleware(route.schema)]
                            : []),
                        // Route-specific middleware last
                        ...(route.middleware || []),
                    ];

                    // Create a new index variable to track the current middleware
                    let index = -1;
                    // Define the single recursive next function
                    const next = async (): Promise<Response> => {
                        index++; // Move to the next middleware/handler

                        if (index < middlewaresToRun.length) {
                            // If there's middleware left, call it, passing the SAME next function
                            try {
                                return await middlewaresToRun[index](
                                    req,
                                    res,
                                    next
                                );
                            } catch (middlewareError) {
                                // If a middleware throws, catch it and let the main error handler deal with it
                                console.error(
                                    'Error caught in API middleware chain:',
                                    middlewareError
                                );
                                throw middlewareError; // Re-throw to be caught by the main fetch try/catch
                            }
                        } else {
                            // If no middleware left, call the final API handler
                            try {
                                const response =  await handler(req, res);
                                req.logger.debug(`body = ${await response.text()}`)
                                req.logger.info(`${response.status}`)
                                return response
                    
                            } catch (handlerError) {
                                console.error(
                                    'Error caught in API handler:',
                                    handlerError
                                );
                                throw handlerError; // Re-throw to be caught by the main fetch try/catch
                            }
                        }
                    };

                    // Start the middleware chain execution by calling next() for the first time
                    return await next();
                },
                port,
                cb
            );
        } else {
            // Fallback to default handler if no router is provided
            this.server.start(
                undefined,
                async (_: BurgerRequest, res: BurgerResponse) => {
                    return res
                        .status(200)
                        .json({ message: 'Hello from burger-api!' });
                },
                port,
                cb
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
    BurgerResponse,
    BurgerNext,
    Middleware,
    openapi,
} from '@burgerTypes';
