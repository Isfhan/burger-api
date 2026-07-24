// Import stuff  from core
import { Server } from './core/server';
import { ApiRouter } from './core/api-router';
import { PageRouter } from './core/page-router';
import { generateOpenAPIDocument } from './core/openapi';
import { swaggerHtml } from './core/swagger-ui';

// Import router (Phase 1 — Hybrid Router)
import { Router } from './router';

// Import compiler pipeline (Phase 1 — Route Module pipeline)
import { DirectoryScanner } from './compiler/scanner';
import { ModuleLoader } from './compiler/module-loader';
import { RouteTree } from './compiler/route-tree';

// Import utils
import { collectRoutes, compareRoutes } from './utils/index';
import { NOT_FOUND, OPENAPI_ERROR } from './utils/response';

// Import validation (Phase 3)
import { schemaRegistry } from './validation/registry';

// Import plugin system (Phase 4 M5)
import { PluginRegistry } from './plugin/registry';
import { MacroRegistry } from './plugin/macro';
import type { Plugin, MacroFn } from './plugin/types';
import type { Scope } from './chain/node';

// Import types
import type {
    ServerOptions,
    RequestHandler,
    RouteDefinition,
    RouteHooks,
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
     * The resolved API directory (dev path) — retained so the Route Module
     * pipeline can re-scan it without poking at ApiRouter internals.
     */
    private apiDir?: string;

    /**
     * The API path prefix (dev path).
     */
    private apiPrefix: string = 'api';

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
     * The structural route tree (Phase 1), retained for introspection and
     * deterministic ordering. Built once from the Module Loader output; not
     * used on the request hot path.
     */
    private routeTree?: import('./compiler/route-tree').RouteTree;

    /**
     * Plugin registry (Phase 4 M5). Populated via `.use()` before `serve()`;
     * resolved into `HookChain` nodes during `processApiRoutes()`.
     */
    private pluginRegistry = new PluginRegistry();

    /**
     * Macro registry (Phase 4 M6). Populated via `.macro()` before `serve()`;
     * expanded into `ResolvedPlugin` entries during `processApiRoutes()` and
     * composed into the HookChain alongside plugins.
     */
    private macroRegistry = new MacroRegistry();

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
     */
    constructor(private options: ServerOptions) {
        // Create server instance
        this.server = new Server(options);

        // Fast initialization for routers with nullish coalescing
        const { apiDir, pageDir, apiPrefix, pagePrefix } = options;

        // Initialize API router only when using runtime scanning (no prebuilt apiRoutes)
        this.apiRouter =
            apiDir && !Array.isArray(options.apiRoutes)
                ? new ApiRouter(apiDir, apiPrefix || 'api')
                : undefined;
        this.apiDir = apiDir;
        this.apiPrefix = apiPrefix || 'api';

        // Initialize page router only when using runtime scanning (no prebuilt pageRoutes)
        this.pageRouter =
            pageDir && !Array.isArray(options.pageRoutes)
                ? new PageRouter(pageDir, pagePrefix || '')
                : undefined;

        // Phase 3: seed the schema registry from ServerOptions.models so model
        // refs in route schemas resolve at compile time (phase3 §12.12, D10).
        // Seeded before routes compile (the registry is read-only after).
        if (options.models) {
            for (const name of Object.keys(options.models)) {
                schemaRegistry.register(name, options.models[name]);
            }
        }
    }

    /**
     * Registers a plugin. Plugin hooks are compiled into the HookChain for
     * every route (scoped according to the plugin's scope). The same plugin
     * (name + seed) is deduplicated — calling `.use()` twice with the same
     * identity is a no-op.
     *
     * @param plugin  The plugin object or a factory function returning one.
     * @param scope   Optional scope override (default: `'plugin'`).
     * @param seed    Optional disambiguation string (e.g. two JWT plugins).
     * @returns `this` for chaining.
     */
    use(plugin: Plugin, scope?: Scope, seed?: string): this {
        this.pluginRegistry.register(plugin, scope ?? 'plugin', seed);
        return this;
    }

    /**
     * Registers a reusable hook factory (macro). Macros are expanded at compile
     * time into plugin-scoped hooks that apply to every route.
     *
     * @param name  Unique macro name.
     * @param fn    Factory function that returns `RouteHooks`.
     * @returns `this` for chaining.
     */
    macro(name: string, fn: MacroFn): this {
        this.macroRegistry.register(name, fn);
        return this;
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
     * Routes are compiled by the Router. Static routes and dynamic (`:param` /
     * `*`) routes are both merged into Bun's native `routes` map; dynamic
     * routes dispatch directly (the compiled handler self-extracts params from
     * the URL), avoiding the `fetch` fallback hop. Unmatched, loose-trailing-
     * slash, and empty-param requests fall through to `Router.fetch` (the trie
     * fallback). Both paths execute the same compiled handler, so method
     * dispatch, 405+Allow, auto-HEAD, and middleware behavior are identical.
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
            // Dev path: Route Module pipeline
            // (Directory Scanner → Module Loader → RouteModule → Compiler).
            if (!this.apiDir) return false;
            const scanned = await new DirectoryScanner(
                this.apiDir,
                this.apiPrefix
            ).scan();
            const modules = await new ModuleLoader().load(scanned);
            // Retained for introspection (deterministic ordering, no dispatch).
            this.routeTree = new RouteTree(modules);
            apiRoutes = modules.map((m) => ({
                path: m.path,
                handlers: m.handlers,
                schema: m.schema,
                openapi: m.openapi,
                hooks: m.hooks as RouteHooks | undefined,
                isWildcard: m.isWildcard,
            }));
        }

        // If there are no API routes, return false
        if (apiRoutes.length === 0) return false;

        // Generate OpenAPI document and cache it
        this.openApiDoc = generateOpenAPIDocument(apiRoutes, this.options);

        // Compile routes into the Hybrid Router.
        const router = new Router({
            debug: this.options.debug,
            validation: this.options.validation ?? {},
        });
        // Phase 4 M5/M6: resolve plugins and expand macros, then merge both
        // into a single list passed to the compiler. Macro hooks are treated as
        // plugin-scoped entries, so the flattener orders them between global
        // (validation) and local (route) hooks.
        const resolvedPlugins = await this.pluginRegistry.resolveAll();
        const expandedMacros = this.macroRegistry.expandAll();
        const allHooks = [...resolvedPlugins, ...expandedMacros];
        router.compile(apiRoutes, allHooks);
        this.dynamicRouter = router;

        // Merge static routes into Bun's native routes map (fast path), then
        // merge dynamic (`:param` / `*`) routes onto the same native map. Bun
        // matches `:param` and `*` patterns directly, so dynamic routes dispatch
        // without the `fetch` fallback hop; the compiled handler self-extracts
        // params from the URL. Unmatched / loose-slash / empty-param requests
        // still fall through to `Router.fetch` (the trie), preserving behavior.
        Object.assign(this.routes, router.staticRoutes());
        Object.assign(this.routes, router.nativeRoutes());

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

            this.server.start({
                staticRoutes: this.routes,
                fetch: fetchHandler,
                port,
                onListen: cb,
            });
        } else {
            // If no routes were configured, log an error
            console.error(
                'Error: No routes configured! Please provide apiDir/pageDir (for dev) or apiRoutes/pageRoutes (for production builds) when initializing the Burger class.'
            );
        }
    }

    /**
     * Returns the underlying `Server` instance, or `undefined` if `serve()`
     * has not started one yet (e.g. no routes were configured). Exposed so
     * callers (such as benchmark harnesses) can stop the server cleanly.
     */
    public getServer(): Server | undefined {
        return this.server;
    }
}

// Export utils
export { setDir } from './utils/index';

// Export BurgerContext (the public request context type)
export { BurgerContext } from './context/context';

// Export error classes (Phase 3)
export { HTTPError } from './errors/http-error';
export { ValidationError } from './validation/error';

// Export types
export type {
    ServerOptions,
    RequestHandler,
    BurgerNext,
    openapi,
    RouteDefinition,
    PageDefinition,
    RouteHooks,
    TransformMap,
    ContextSet,
    RouteMeta,
    ContextField,
} from './types/index';

// Export plugin types (Phase 4 M5) and macro types (Phase 4 M6)
export type { Plugin, MacroFn } from './plugin/types';
export type { Scope } from './chain/node';
