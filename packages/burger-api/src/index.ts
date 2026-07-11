// Import stuff  from core
import { Server } from './core/server';
import { ApiRouter } from './core/api-router';
import { PageRouter } from './core/page-router';
import { generateOpenAPIDocument } from './core/openapi';
import { swaggerHtml } from './core/swagger-ui';

// Import router (Phase 1 — Hybrid Router)
import { Router } from './router';

// Import utils
import { collectRoutes, compareRoutes } from './utils/index';
import { NOT_FOUND, OPENAPI_ERROR } from './utils/response';

// Import types
import type {
    ServerOptions,
    Middleware,
    RequestHandler,
    RouteDefinition,
    FetchHandler,
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
     * The compiled API router (Phase 1 Hybrid Router).
     * Owns static dispatch (Bun map) + dynamic/wildcard dispatch (trie).
     */
    private dynamicRouter?: Router;

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
            apiDir && !Array.isArray(options.apiRoutes)
                ? new ApiRouter(apiDir, apiPrefix || 'api')
                : undefined;

        // Initialize page router only when using runtime scanning (no prebuilt pageRoutes)
        this.pageRouter =
            pageDir && !Array.isArray(options.pageRoutes)
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
        if (Array.isArray(prebuiltPages)) {
            // Sort the prebuilt pages
            const sorted = [...prebuiltPages].sort((a, b) =>
                compareRoutes(a, b)
            );

            for (let i = 0; i < sorted.length; i++) {
                const page = sorted[i];
                this.routes[page.path] = page.handler;
            }
            return sorted.length > 0;
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
     * Process the API routes and add them to the routes object.
     *
     * Phase 1: routes are compiled by the Hybrid Router. Static routes are
     * merged into Bun's native `routes` map; dynamic/wildcard routes are
     * dispatched by `Router.fetch` (the `Bun.serve` fallback) via the internal
     * trie. Both paths execute the same compiled handler.
     *
     * @returns A promise that resolves to a boolean
     */
    private async processApiRoutes(): Promise<boolean> {
        // Production path: use pre-built API routes (no filesystem scan)
        let apiRoutes: RouteDefinition[];
        if (Array.isArray(this.options.apiRoutes)) {
            apiRoutes = [...this.options.apiRoutes].sort((a, b) =>
                compareRoutes(a, b)
            );
        } else {
            // Dev path: load from filesystem via ApiRouter
            if (!this.apiRouter) return false;
            await this.apiRouter.loadRoutes();
            apiRoutes = collectRoutes(this.apiRouter.routes);
        }

        // If there are no API routes, return false
        if (apiRoutes.length === 0) return false;

        // Generate OpenAPI document and cache it
        this.openApiDoc = generateOpenAPIDocument(apiRoutes, this.options);

        // Compile routes into the Hybrid Router.
        const router = new Router({ globalMiddleware: this.globalMiddleware });
        router.compile(apiRoutes);
        this.dynamicRouter = router;

        // Merge static routes into Bun's native routes map (fast path).
        Object.assign(this.routes, router.staticRoutes());

        // Add special routes for OpenAPI
        this.routes['/openapi.json'] = () =>
            this.openApiDoc
                ? Response.json(this.openApiDoc)
                : this.OPENAPI_ERROR;

        // Add special route for Swagger UI
        this.routes['/docs'] = () =>
            new Response(swaggerHtml, {
                headers: { 'Content-Type': 'text/html' },
            });

        return true;
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
            const fetchHandler: FetchHandler = this.dynamicRouter
                ? (request) => this.dynamicRouter!.fetch(request)
                : () => this.NOT_FOUND;

            this.server.start(this.routes, fetchHandler, port, cb);
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
