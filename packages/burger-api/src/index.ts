// Import stuff  from core
import { Server } from './core/server';
import { ApiRouter } from './core/api-router';
import { PageRouter } from './core/page-router';
import { generateOpenAPIDocument } from './core/openapi';
import { scalarDocs } from './core/docs-providers';

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

// Import WebSocket modules (Phase 9)
import { WebSocketScanner } from './ws/scanner';
import { WebSocketCompiler } from './ws/compiler';
import { WebSocketRouter } from './ws/router';
import { WebSocketAdapter } from './ws/adapter';

// Import types
import type {
    ServerOptions,
    RequestHandler,
    RouteDefinition,
    RouteHooks,
    FetchHandler,
    OpenAPIConfig,
    DocsProvider,
} from './types/index';
import type { WebSocketConfig } from './ws/types';
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
     * Plugin registry (Phase 4 M5). Populated via `.usePlugin()` before `serve()`;
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
     * Application services registered via `burger.provide()`. Injected into
     * `ctx.services` for every request at context creation time.
     */
    private providers = new Map<string, unknown>();

    /**
     * The OpenAPI document
     */
    private openApiDoc: any = null;

    /**
     * The loaded OpenAPI configuration from openapi.config.ts.
     */
    private openAPIConfig?: OpenAPIConfig;

    /**
     * The routes object
     */
    private routes: {
        [key: string]: HTMLBundle | RequestHandler;
    } = {};

    /**
     * WebSocket directory (dev path)
     */
    private wsDir?: string;

    /**
     * WebSocket router (Phase 9)
     */
    private wsRouter?: WebSocketRouter;

    /**
     * WebSocket adapter (Phase 9)
     */
    private wsAdapter?: WebSocketAdapter;

    /**
     * WebSocket config (Phase 9)
     */
    private wsConfigOptions?: WebSocketConfig;

    /**
     * Programmatic WebSocket routes (Phase 9)
     */
    private programmaticWsRoutes: Map<string, any> = new Map();

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
     * - wsDir: The directory path to load WebSocket routes from.
     */
    constructor(private options: ServerOptions) {
        // Create server instance
        this.server = new Server(options);

        // Fast initialization for routers with nullish coalescing
        const { apiDir, pageDir, apiPrefix, pagePrefix, wsDir } = options;

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

        // Initialize WebSocket directory (Phase 9)
        this.wsDir = wsDir;

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
     * (name + seed) is deduplicated — calling `.usePlugin()` twice with the same
     * identity is a no-op.
     *
     * @param plugin  The plugin object or a factory function returning one.
     * @param scope   Optional scope override (default: `'plugin'`).
     * @param seed    Optional disambiguation string (e.g. two JWT plugins).
     * @returns `this` for chaining.
     */
    usePlugin(plugin: Plugin, scope?: Scope, seed?: string): this {
        this.pluginRegistry.register(plugin, scope ?? 'plugin', seed);
        return this;
    }

    /**
     * @deprecated Use `usePlugin()` instead.
     */
    use(plugin: Plugin, scope?: Scope, seed?: string): this {
        return this.usePlugin(plugin, scope, seed);
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
     * Registers an application service. Services are created once at startup
     * and injected into `ctx.services` for every request.
     *
     * @param name  Service name (accessed as `ctx.services[name]`).
     * @param service  The service instance.
     * @returns `this` for chaining.
     */
    provide(name: string, service: unknown): this {
        this.providers.set(name, service);
        return this;
    }

    /**
     * Register a WebSocket route programmatically (Phase 9).
     * @param path  Route path (e.g., "/chat", "/notifications/:room")
     * @param handlers  WebSocket handler functions
     * @returns `this` for chaining.
     */
    websocket(path: string, handlers: import('./ws/types').WebSocketHandlers): this {
        this.programmaticWsRoutes.set(path, { path, handlers });
        return this;
    }

    /**
     * Set global WebSocket configuration (Phase 9).
     * @param config  WebSocket configuration options
     * @returns `this` for chaining.
     */
    wsConfig(config: WebSocketConfig): this {
        this.wsConfigOptions = config;
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
     * dispatch, 405+Allow, auto-HEAD, and lifecycle behavior are identical.
     *
     * @returns A promise that resolves to a boolean
     */
    private async processApiRoutes(): Promise<boolean> {
        // Production path: use pre-built API routes (no filesystem scan)
        let apiRoutes: RouteDefinition[];
        let globalOnRequest: import('./lifecycle/types').Hook[] | undefined;
        if (Array.isArray(this.options.apiRoutes)) {
            apiRoutes = [...this.options.apiRoutes].sort((a, b) =>
                compareRoutes(a, b)
            );
            // Production: accept config from ServerOptions if provided
            this.openAPIConfig = this.options.openapi;
        } else {
            // Dev path: Route Module pipeline
            // (Directory Scanner → Module Loader → RouteModule → Compiler).
            if (!this.apiDir) return false;
            const scanned = await new DirectoryScanner(
                this.apiDir,
                this.apiPrefix
            ).scan();
            const loader = new ModuleLoader();
            const modules = await loader.load(scanned);
            globalOnRequest = scanned.globalOnRequest;

            // Load openapi.config.ts if discovered
            this.openAPIConfig = await loader.loadOpenAPIConfig(scanned);

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
        this.openApiDoc = generateOpenAPIDocument(
            apiRoutes,
            this.options,
            this.openAPIConfig
        );

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

        // Extract onRequest hooks from plugins — these run before routing
        // (pre-routing, app-level). They are NOT per-route HookPlan entries.
        // Order: Framework (internal) → Plugin → Global (src/hooks.ts) → Route
        const onRequestHooks: import('./lifecycle/types').Hook[] = [];
        for (const plugin of allHooks) {
            const h = plugin.hooks.onRequest;
            if (h) {
                if (Array.isArray(h)) onRequestHooks.push(...h);
                else onRequestHooks.push(h);
            }
        }
        // Global onRequest from src/hooks.ts runs after plugins
        onRequestHooks.push(...(globalOnRequest ?? []));

        router.compile(apiRoutes, allHooks, this.providers, onRequestHooks);
        this.dynamicRouter = router;

        // Merge static routes into Bun's native routes map (fast path), then
        // merge dynamic (`:param` / `*`) routes onto the same native map. Bun
        // matches `:param` and `*` patterns directly, so dynamic routes dispatch
        // without the `fetch` fallback hop; the compiled handler self-extracts
        // params from the URL. Unmatched / loose-slash / empty-param requests
        // still fall through to `Router.fetch` (the trie), preserving behavior.
        Object.assign(this.routes, router.staticRoutes());
        Object.assign(this.routes, router.nativeRoutes());

        // Register OpenAPI and docs routes based on config
        const config = this.openAPIConfig;
        const openapiEnabled = config?.enabled !== false;

        if (openapiEnabled) {
            const specPath = config?.path ?? '/openapi.json';
            const docsPath = config?.docsPath ?? '/docs';

            this.routes[specPath] = () =>
                this.openApiDoc
                    ? Response.json(this.openApiDoc)
                    : this.OPENAPI_ERROR;

            // Docs UI: use configured provider or default to Scalar
            const provider: DocsProvider = config?.provider ?? scalarDocs();
            this.routes[docsPath] = (ctx: any) => {
                // Basic auth protection
                if (config?.docsAuth) {
                    const authHeader =
                        ctx?.request?.headers?.get('authorization') ?? '';
                    const expected = 'Basic ' + btoa(`${config.docsAuth.username}:${config.docsAuth.password}`);
                    if (authHeader !== expected) {
                        return new Response('Unauthorized', {
                            status: 401,
                            headers: {
                                'WWW-Authenticate': 'Basic realm="Documentation"',
                            },
                        });
                    }
                }

                const result = provider(this.openApiDoc!);
                if (result instanceof Response) return result;
                return new Response(result, {
                    headers: { 'Content-Type': 'text/html' },
                });
            };
        }

        return true;
    }

    /**
     * Process WebSocket routes and add them to the WebSocket router (Phase 9).
     * @returns A promise that resolves to a boolean indicating if WebSocket routes were configured
     */
    private async processWebSocketRoutes(): Promise<boolean> {
        // Create WebSocket router
        this.wsRouter = new WebSocketRouter();

        // Extract auth hooks from resolved plugins for WebSocket upgrade
        const resolvedPlugins = await this.pluginRegistry.resolveAll();
        let pluginTransform: import('./lifecycle/types').TransformMap | undefined;
        const pluginBeforeRoute: import('./lifecycle/types').Hook[] = [];

        for (const plugin of resolvedPlugins) {
            // Collect transform hooks
            if (plugin.hooks.transform) {
                if (!pluginTransform) pluginTransform = {};
                Object.assign(pluginTransform, plugin.hooks.transform);
            }
            // Collect beforeRoute hooks
            if (plugin.hooks.beforeRoute) {
                const hooks = Array.isArray(plugin.hooks.beforeRoute)
                    ? plugin.hooks.beforeRoute
                    : [plugin.hooks.beforeRoute];
                pluginBeforeRoute.push(...hooks);
            }
        }

        this.wsAdapter = new WebSocketAdapter({
            router: this.wsRouter,
            config: this.wsConfigOptions,
            debug: this.options.debug,
            providers: this.providers,
            pluginTransform,
            pluginBeforeRoute: pluginBeforeRoute.length > 0 ? pluginBeforeRoute : undefined,
        });

        // Add programmatic routes
        for (const [path, route] of this.programmaticWsRoutes) {
            this.wsRouter.addRoute({
                path,
                handlers: route.handlers,
                config: this.wsConfigOptions ?? {},
            });
        }

        // Scan file-based routes if wsDir is provided
        if (this.wsDir) {
            const scanner = new WebSocketScanner(this.wsDir);
            const scanResult = await scanner.scan();

            if (scanResult.routes.length > 0) {
                const compiler = new WebSocketCompiler();

                // Set global hooks if found
                if (scanResult.globalHooks) {
                    try {
                        const hooksModule = await import(scanResult.globalHooks);
                        compiler.setGlobalHooks({
                            onOpen: hooksModule.onOpen,
                            onMessage: hooksModule.onMessage,
                            onClose: hooksModule.onClose,
                        });
                    } catch (error) {
                        console.error('[WebSocket] Failed to load global hooks:', error);
                    }
                }

                // Set global config
                if (this.wsConfigOptions) {
                    compiler.setGlobalConfig(this.wsConfigOptions);
                }

                // Compile all routes
                const compiledRoutes = await compiler.compileAll(scanResult.routes);

                // Add to router
                this.wsRouter.addRoutes(compiledRoutes);
            }
        }

        return this.wsRouter.getRouteCount() > 0;
    }

    /**
     * Starts the server and begins listening for incoming requests.
     * @param port - The port number to listen on. Defaults to `4000`.
     * @param cb - An optional cb function to be executed when the server is listening.
     * @returns A Promise that resolves when the server has started listening.
     */
    public async serve(port: number = 4000, cb?: () => void): Promise<void> {
        // Process routes in parallel if possible
        const [pagesConfigured, apiConfigured, wsConfigured] = await Promise.all([
            this.processPageRoutes(),
            this.processApiRoutes(),
            this.processWebSocketRoutes(),
        ]);

        // Flag to track if any routes were loaded
        const routesConfigured = pagesConfigured || apiConfigured || wsConfigured;

        // If routes were configured, start the server
        if (routesConfigured) {
            // Start the server
            const fetchHandler: FetchHandler = this.dynamicRouter
                ? (request) => this.dynamicRouter!.fetch(request)
                : () => this.NOT_FOUND;

            // Get WebSocket handlers and fetch handler if adapter is configured
            const wsOptions = this.wsAdapter?.createWebSocketOption();
            const wsFetchHandler = this.wsAdapter?.createFetchHandler();

            // Create a combined fetch handler:
            // 1. Try WebSocket upgrade first (if wsAdapter exists)
            // 2. Fall through to HTTP handler
            const combinedFetch: FetchHandler = wsFetchHandler
                ? async (request, server) => {
                    // Try WebSocket upgrade (calls server.upgrade internally)
                    const wsResponse = await wsFetchHandler(request, server as any);
                    if (wsResponse !== undefined) {
                        return wsResponse as Response;
                    }
                    // Not a WebSocket upgrade or upgrade failed — fall through to HTTP
                    return fetchHandler(request);
                }
                : fetchHandler;

            this.server.start({
                staticRoutes: this.routes,
                fetch: combinedFetch,
                websocket: wsOptions,
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
export type { BurgerServices } from './context/context';

// Export error classes (Phase 3 + Phase 6)
export { HTTPError, renderHTTPError } from './errors/http-error';
export { ValidationError } from './validation/error';
export { NotFoundError } from './errors/not-found';
export { UnauthorizedError } from './errors/unauthorized';
export { ForbiddenError } from './errors/forbidden';
export { MethodNotAllowedError } from './errors/method-not-allowed';

// Export docs providers (Phase 5)
export { scalarDocs, swaggerDocs, redocDocs } from './core/docs-providers';

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
    OpenAPIConfig,
} from './types/index';

// Export plugin types (Phase 4 M5) and macro types (Phase 4 M6)
export type { Plugin, MacroFn } from './plugin/types';
export type { Scope } from './chain/node';

// Export WebSocket types (Phase 9)
export type {
    BurgerWS,
    WebSocketData,
    WebSocketConfig,
    WebSocketRouteDefinition,
    WebSocketHandlers,
    WebSocketHooks,
    CompiledWebSocketRoute,
    WebSocketModule,
    WebSocketHooksModule,
    WebSocketConfigModule,
} from './ws/types';

export {
    WebSocketReadyState,
    WebSocketCloseCode,
    BurgerWSContext,
} from './ws/types';

// Export WebSocket modules (Phase 9)
export { WebSocketScanner } from './ws/scanner';
export type { ScannedWebSocketRoute, WebSocketScanResult } from './ws/scanner';

export { WebSocketCompiler } from './ws/compiler';

export { WebSocketRouter } from './ws/router';

export { WebSocketAdapter } from './ws/adapter';
export type { WebSocketAdapterOptions } from './ws/adapter';
