// Import stuff from core
import { Server } from './core/server.js';
import { timingSafeEqual } from './utils/timing-safe.js';

// Import router
import { Router } from './router/index.js';
import { extractCtxInit } from './router/param-extract.js';
import { BurgerContext } from './context/context.js';

// Import utils
import { collectRoutes, compareRoutes, setDir } from './utils/index.js';
import { notFound, openApiError } from './utils/response.js';

// Import plugin system
import { PluginRegistry } from './plugin/registry.js';
import type { Plugin } from './plugin/types.js';
import type { Scope } from './chain/node.js';

// Import WebSocket modules (scanner/compiler are loaded lazily on the dev
// filesystem path only — production AOT builds never evaluate them)
import { WebSocketRouter } from './ws/router.js';
import { WebSocketAdapter } from './ws/adapter.js';

// Import types
import type {
    ServerOptions,
    RequestHandler,
    RouteDefinition,
    RouteHooks,
    FetchHandler,
    EnvFetchHandler,
    OpenAPIConfig,
    DocsProvider,
} from './types/index.js';
import type { WebSocketConfig } from './ws/types.js';
import type {
    NodeWsBridge,
    NodeWsBridgeOptions,
} from './ws/platform.js';

export class Burger {
    /**
     * The server instance
     */
    private server: Server;

    /**
     * The resolved API directory (dev path) — retained so the Route Module
     * pipeline can re-scan it without poking at router internals.
     */
    private apiDir?: string;

    /**
     * The API path prefix (dev path).
     */
    private apiPrefix: string = 'api';

    /**
     * The page router instance (dev path only — created lazily on first
     * page-routes scan, so production AOT bundles never load it).
     */
    private pageRouter?: import('./core/page-router.js').PageRouter;

    /**
     * The page directory (dev path) — retained so the page router can be
     * created lazily in `processPageRoutes()`.
     */
    private pageDir?: string;

    /**
     * The page path prefix (dev path).
     */
    private pagePrefix = '';

    /**
     * The compiled API router.
     * Owns static dispatch (Bun map) + dynamic/wildcard dispatch (trie).
     */
    private dynamicRouter?: Router;

    /**
     * The structural route tree, retained for introspection and
     * deterministic ordering. Built once from the Module Loader output; not
     * used on the request hot path.
     */
    private routeTree?: import('./compiler/route-tree.js').RouteTree;

    /**
     * Plugin registry. Populated via `.usePlugin()` before `serve()`;
     * resolved into `HookChain` nodes during `processApiRoutes()`.
     */
    private pluginRegistry = new PluginRegistry();

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
        [key: string]: RequestHandler;
    } = {};

    /**
     * WebSocket directory (dev path)
     */
    private wsDir?: string;

    /**
     * WebSocket router
     */
    private wsRouter?: WebSocketRouter;

    /**
     * WebSocket adapter
     */
    private wsAdapter?: WebSocketAdapter;

    /**
     * WebSocket config
     */
    private wsConfigOptions?: WebSocketConfig;

    /**
     * Programmatic WebSocket routes
     */
    private programmaticWsRoutes: Map<string, any> = new Map();

    /**
     * The not found response
     */
    private readonly notFound = notFound;

    /**
     * The OpenAPI error response
     */
    private readonly openApiError = openApiError;

    /**
     * Set once API routes have been compiled. Guards `processApiRoutes()` from
     * re-running when both `serve()` and `fetchHandler()` are used.
     */
    private routesProcessed = false;

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
        // Create server instance (adapter seam: injectable for tests/embed,
        // otherwise the Bun adapter is loaded lazily on first serve()).
        this.server = new Server(options, options.adapter);

        // Fast initialization for routers with nullish coalescing
        const { apiDir, apiPrefix, wsDir } = options;

        this.apiDir = apiDir;
        this.apiPrefix = apiPrefix || 'api';

        // Pages are resolved lazily on the dev scan path (PageRouter is
        // loaded on demand so production AOT bundles stay small).
        this.pageDir = options.pageDir;
        this.pagePrefix = options.pagePrefix ?? '';

        // Initialize WebSocket directory
        this.wsDir = wsDir;
    }

    /**
     * Registers a plugin. Plugin hooks are compiled into the HookChain for
     * every route (scoped according to the plugin's scope). The same plugin
     * (name + seed) is deduplicated — calling `.usePlugin()` twice with the same
     * identity is a no-op.
     *
     * @param plugin The plugin object or a factory function returning one.
     * @param scope Optional scope override (default: `'plugin'`).
     * @param seed Optional disambiguation string (e.g. two JWT plugins).
     * @returns `this` for chaining.
     */
    usePlugin(plugin: Plugin, scope?: Scope, seed?: string): this {
        this.pluginRegistry.register(plugin, scope ?? 'plugin', seed);
        return this;
    }

    /**
     * Registers an application service. Services are created once at startup
     * and injected into `ctx.services` for every request.
     *
     * @param name Service name (accessed as `ctx.services[name]`).
     * @param service The service instance.
     * @returns `this` for chaining.
     */
    provide(name: string, service: unknown): this {
        this.providers.set(name, service);
        return this;
    }

    /**
     * Register a WebSocket route programmatically.
     * @param path Route path (e.g., "/chat", "/notifications/:room")
     * @param handlers WebSocket handler functions
     * @returns `this` for chaining.
     */
    websocket(
        path: string,
        handlers: import('./ws/types.js').WebSocketHandlers
    ): this {
        this.programmaticWsRoutes.set(path, { path, handlers });
        return this;
    }

    /**
     * Set global WebSocket configuration.
     * @param config WebSocket configuration options
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
        let hasPages = false;
        if (Array.isArray(prebuiltPages)) {
            // Sort the prebuilt pages
            const sorted = [...prebuiltPages].sort((a, b) =>
                compareRoutes(a, b)
            );

            for (let i = 0; i < sorted.length; i++) {
                const page = sorted[i]!;
                this.routes[page.path] = this.wrapPageHandler(
                    page.handler,
                    page.path
                );
            }
            hasPages = sorted.length > 0;
        } else if (this.pageDir) {
            // Dev path: load from filesystem via PageRouter
            // Lazy-load the page router (dev-only; never evaluated in
            // production AOT bundles that ship prebuilt pageRoutes).
            const { PageRouter } = await import('./core/page-router.js');
            const pageRouter = new PageRouter(this.pageDir, this.pagePrefix);
            this.pageRouter = pageRouter;

            // Load pages routes
            await pageRouter.loadPages();
            // If there are any page routes, add them to the routes object
            const pages = pageRouter.pages;

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i]!;
                this.routes[page.path] = this.wrapPageHandler(
                    page.handler,
                    page.path
                );
            }
            hasPages = pages.length > 0;
        }

        // Static assets under `<pageDir>/assets/` — embedded table from the
        // AOT build, or read-from-disk when running with `pageDir`.
        await this.processAssetRoutes();

        return hasPages;
    }

    /**
     * Wraps a page handler for registration on Bun's native routes map.
     *
     * Dynamic pages (`[param]` → `:param`) need their params extracted from
     * the URL (Bun matches the pattern but does not expose them), so the
     * handler is wrapped with a per-request `BurgerContext`. Static pages
     * pass through unchanged.
     */
    private wrapPageHandler(
        handler: RequestHandler,
        path: string
    ): RequestHandler {
        if (!path.includes(':')) return handler;
        // Registered on Bun's native routes map, so this is invoked with the
        // raw `Request` (mirrors `fetchHandler`'s static dispatch).
        const wrapped = async (request: Request): Promise<Response> => {
            const ctxInit = extractCtxInit(request, path, false);
            const ctx = BurgerContext.create(request, ctxInit);
            return handler(ctx);
        };
        return wrapped as unknown as RequestHandler;
    }

    /**
     * Registers static asset routes under `{pagePrefix}/assets/*`.
     *
     * Production AOT builds embed file contents as base64 (`assetRoutes`
     * option — emitted by the CLI build), keeping bundles self-contained.
     * Dev reads files from disk per request so edits show without a restart.
     */
    private async processAssetRoutes(): Promise<void> {
        const prebuiltAssets = this.options.assetRoutes;
        if (Array.isArray(prebuiltAssets)) {
            const { embeddedAssetHandler } = await import('./core/assets.js');
            for (const asset of prebuiltAssets) {
                this.routes[asset.path] = embeddedAssetHandler(asset);
            }
            return;
        }

        if (!this.pageDir) return;
        const { collectDiskAssetRoutes, diskAssetHandler } = await import(
            './core/assets.js'
        );
        const routes = await collectDiskAssetRoutes(
            this.pageDir,
            this.pagePrefix
        );
        for (const route of routes) {
            this.routes[route.routePath] = diskAssetHandler(route);
        }
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
        if (this.routesProcessed) return true;
        // Production path: use pre-built API routes (no filesystem scan)
        let apiRoutes: RouteDefinition[];
        let globalOnRequest: import('./lifecycle/types.js').Hook[] | undefined;
        if (Array.isArray(this.options.apiRoutes)) {
            apiRoutes = [...this.options.apiRoutes].sort((a, b) =>
                compareRoutes(a, b)
            );
            // Production: accept config from ServerOptions if provided
            this.openAPIConfig = this.options.openapi;

            // Production: resolve global hooks from options
            const globalHooks = this.options.globalHooks;
            if (globalHooks) {
                const onRequest = globalHooks.onRequest;
                if (onRequest) {
                    globalOnRequest = Array.isArray(onRequest)
                        ? (onRequest as import('./lifecycle/types.js').Hook[])
                        : [onRequest as import('./lifecycle/types.js').Hook];
                }
            }

            // Production: execute plugins module if provided
            const pluginsMod = this.options.pluginsModule;
            if (pluginsMod) {
                const defaultFn = (pluginsMod as any).default;
                if (typeof defaultFn === 'function') {
                    (defaultFn as (burger: Burger) => void)(this);
                }
            }

            // Production: execute providers module if provided
            const providersMod = this.options.providersModule;
            if (providersMod) {
                const defaultFn = (providersMod as any).default;
                if (typeof defaultFn === 'function') {
                    (defaultFn as (burger: Burger) => void)(this);
                }
            }
        } else {
            // Dev path: Route Module pipeline
            // (Directory Scanner → Module Loader → RouteModule → Compiler).
            // Loaded lazily: production AOT builds ship prebuilt apiRoutes
            // and never evaluate these filesystem modules.
            if (!this.apiDir) return false;
            const { DirectoryScanner } = await import('./compiler/scanner.js');
            const { ModuleLoader } = await import('./compiler/module-loader.js');
            const scanned = await new DirectoryScanner(
                this.apiDir,
                this.apiPrefix
            ).scan();
            const loader = new ModuleLoader();
            const modules = await loader.load(scanned);
            globalOnRequest = scanned.globalOnRequest;

            // Load openapi.config.ts if discovered
            this.openAPIConfig = await loader.loadOpenAPIConfig(scanned);

            // Load and execute plugins.ts (auto-discovered at app root)
            const pluginsFn = await loader.loadPlugins(scanned);
            if (typeof pluginsFn === 'function') {
                (pluginsFn as (burger: Burger) => void)(this);
            }

            // Load and execute providers.ts (auto-discovered at app root)
            const providersFn = await loader.loadProviders(scanned);
            if (typeof providersFn === 'function') {
                (providersFn as (burger: Burger) => void)(this);
            }

            // Retained for introspection (deterministic ordering, no dispatch).
            const { RouteTree } = await import('./compiler/route-tree.js');
            this.routeTree = new RouteTree(modules);
            apiRoutes = modules.map((m) => ({
                path: m.path,
                handlers: m.handlers,
                schema: m.schema,
                openapi: m.openapi,
                hooks: m.hooks as RouteHooks | undefined,
                config: m.config,
                isWildcard: m.isWildcard,
            }));
        }

        // If there are no API routes, return false
        if (apiRoutes.length === 0) return false;

        const config = this.openAPIConfig;
        const openapiEnabled = config?.enabled !== false;

        // Generate the OpenAPI document only when docs are enabled, and load
        // the generator lazily (it pulls Zod's JSON Schema machinery).
        if (openapiEnabled) {
            const { generateOpenAPIDocument } = await import('./core/openapi.js');
            this.openApiDoc = generateOpenAPIDocument(
                apiRoutes,
                this.options,
                this.openAPIConfig
            );
        }

        // Compile routes into the Hybrid Router.
        const router = new Router({
            debug: this.options.debug,
            validation: this.options.validation ?? {},
            jit: this.options.jit !== false,
            engine: this.options.engine,
        });
        // M5: resolve plugins into a single list passed to the compiler.
        const allHooks = await this.pluginRegistry.resolveAll();

        // Extract onRequest hooks from plugins — these run before routing
        // (pre-routing, app-level). They are NOT per-route HookPlan entries.
        // Order: Framework (internal) → Plugin → Global (src/hooks.ts) → Route
        const onRequestHooks: import('./lifecycle/types.js').Hook[] = [];
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
        if (openapiEnabled) {
            const specPath = config?.path ?? '/openapi.json';
            const docsPath = config?.docsPath ?? '/docs';

            this.routes[specPath] = () =>
                this.openApiDoc
                    ? Response.json(this.openApiDoc)
                    : this.openApiError();

            // Docs UI: use configured provider or default to Swagger UI (loaded
            // lazily — only needed when the docs route is registered).
            const { swaggerDocs } = await import('./core/docs-providers.js');
            const provider: DocsProvider = config?.provider ?? swaggerDocs();
            const expectedAuth = config?.docsAuth
                ? 'Basic ' +
                  btoa(
                      `${config.docsAuth.username}:${config.docsAuth.password}`
                  )
                : null;
            this.routes[docsPath] = (ctx) => {
                // Basic auth protection (timing-safe comparison)
                if (expectedAuth !== null) {
                    const authHeader =
                        ctx?.headers?.get?.('authorization') ?? '';
                    if (!timingSafeEqual(authHeader, expectedAuth)) {
                        return new Response('Unauthorized', {
                            status: 401,
                            headers: {
                                'WWW-Authenticate':
                                    'Basic realm="Documentation"',
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

        this.routesProcessed = true;
        return true;
    }

    /**
     * Process WebSocket routes and add them to the WebSocket router.
     * @returns A promise that resolves to a boolean indicating if WebSocket routes were configured
     */
    private async processWebSocketRoutes(): Promise<boolean> {
        // Create WebSocket router
        this.wsRouter = new WebSocketRouter();

        // Extract auth hooks from resolved plugins for WebSocket upgrade
        const resolvedPlugins = await this.pluginRegistry.resolveAll();
        let pluginTransform:
            import('./lifecycle/types.js').TransformMap | undefined;
        const pluginBeforeRoute: import('./lifecycle/types.js').Hook[] = [];

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
            pluginBeforeRoute:
                pluginBeforeRoute.length > 0 ? pluginBeforeRoute : undefined,
        });

        // Add programmatic routes
        for (const [path, route] of this.programmaticWsRoutes) {
            this.wsRouter.addRoute({
                path,
                handlers: route.handlers,
                config: this.wsConfigOptions ?? {},
            });
        }

        // Production path: use pre-built WebSocket routes (no filesystem scan)
        const prebuiltWsRoutes = this.options.wsRoutes;
        if (Array.isArray(prebuiltWsRoutes)) {
            for (const route of prebuiltWsRoutes) {
                warnTransportLevelWsConfig(
                    route.path,
                    route.config as Record<string, unknown> | undefined
                );
                this.wsRouter.addRoute({
                    path: route.path,
                    handlers: route.handlers,
                    hooks: route.hooks,
                    // Deep-merge `auth` so a route-level `auth.roles` does
                    // not drop the global `auth.required`.
                    config: mergeWsConfig(this.wsConfigOptions, route.config),
                });
            }
            return this.wsRouter.getRouteCount() > 0;
        }

        // Scan file-based routes if wsDir is provided
        if (this.wsDir) {
            // Dev path — the scanner/compiler are loaded lazily so production
            // AOT builds (prebuilt wsRoutes) never evaluate them.
            const { WebSocketScanner } = await import('./ws/scanner.js');
            const scanner = new WebSocketScanner(this.wsDir);
            const scanResult = await scanner.scan();

            if (scanResult.routes.length > 0) {
                const { WebSocketCompiler } = await import('./ws/compiler.js');
                const compiler = new WebSocketCompiler();

                // Set global hooks if found
                if (scanResult.globalHooks) {
                    try {
                        const hooksModule = await import(
                            scanResult.globalHooks
                        );
                        compiler.setGlobalHooks({
                            onOpen: hooksModule.onOpen,
                            onMessage: hooksModule.onMessage,
                            onClose: hooksModule.onClose,
                        });
                    } catch (error) {
                        console.error(
                            '[WebSocket] Failed to load global hooks:',
                            error
                        );
                    }
                }

                // Set global config
                if (this.wsConfigOptions) {
                    compiler.setGlobalConfig(this.wsConfigOptions);
                }

                // Compile all routes
                const compiledRoutes = await compiler.compileAll(
                    scanResult.routes
                );

                // Add to router
                this.wsRouter.addRoutes(compiledRoutes);
            }
        }

        return this.wsRouter.getRouteCount() > 0;
    }

    /**
     * Builds the Web-Standard fetch handler for this app.
     *
     * The returned handler dispatches the raw `Request` through the compiled
     * routes (static map first, then the trie fallback for dynamic/wildcard
     * routes and loose trailing-slash variants). API routes must be provided
     * AOT (`apiRoutes` option) or discovered from the filesystem on first
     * call — never per request.
     *
     * Runtime-agnostic: usable with `Bun.serve`, `Deno.serve`, Vercel,
     * Cloudflare Workers (`export default { fetch }`), and Node 24+. The
     * platform bindings (`env`, `executionCtx`) forwarded by WinterCG hosts
     * are bound onto the per-request `BurgerContext` (`ctx.env`,
     * `ctx.executionCtx`). Pages and
     * WebSocket are Bun-only and are not served by this handler.
     *
     * ```ts
     * import { Burger, toFetchHandler } from 'burger-api';
     * const burger = new Burger({ apiRoutes });
     * export default { fetch: toFetchHandler(burger) };
     * ```
     */
    public async fetchHandler(): Promise<EnvFetchHandler> {
        await this.processApiRoutes();

        // Prepare WebSocket handling for WinterCG runtimes (Cloudflare /
        // Deno consume upgrades right here). Bun's `serve()` path wires the
        // same adapter itself; plain Node needs createNodeWsBridge instead.
        const hasWsSources =
            Array.isArray(this.options.wsRoutes) ||
            this.programmaticWsRoutes.size > 0 ||
            !!this.wsDir;
        if (!this.wsAdapter && hasWsSources) {
            await this.processWebSocketRoutes();
        }
        const wsAdapter = this.wsAdapter;

        const routes = this.routes;
        const router = this.dynamicRouter;
        return async (
            request: Request,
            env?: import('./context/context.js').BurgerEnv,
            executionCtx?: import('./context/context.js').BurgerExecutionContext
        ): Promise<Response> => {
            // WebSocket upgrades are consumed before HTTP dispatch.
            if (
                wsAdapter &&
                request.headers.get('upgrade')?.toLowerCase() === 'websocket'
            ) {
                const outcome = await wsAdapter.handleUpgrade(
                    request,
                    undefined,
                    env,
                    executionCtx
                );
                if (outcome.handled) {
                    return (outcome.response ??
                        new Response(null, { status: 101 })) as Response;
                }
            }
            const pathname = new URL(request.url).pathname;
            const handler = routes[pathname];
            if (handler) {
                return (
                    handler as unknown as (
                        req: Request,
                        ctxInit?: unknown,
                        prebuilt?: unknown,
                        env?: unknown,
                        executionCtx?: unknown
                    ) => Promise<Response>
                )(request, undefined, undefined, env, executionCtx);
            }
            if (router) return router.fetch(request, env, executionCtx);
            return this.notFound();
        };
    }

    /**
     * Starts the server and begins listening for incoming requests.
     * @param port - The port number to listen on. Defaults to `4000`.
     * @param cb - An optional cb function to be executed when the server is listening.
     * @returns A Promise that resolves when the server has started listening.
     */
    public async serve(port: number = 4000, cb?: () => void): Promise<void> {
        // Process API routes first so convention files (plugins.ts, providers.ts)
        // are loaded before WebSocket reads the registries (avoids race).
        const apiConfigured = await this.processApiRoutes();
        const [pagesConfigured, wsConfigured] = await Promise.all([
            this.processPageRoutes(),
            this.processWebSocketRoutes(),
        ]);

        // Flag to track if any routes were loaded
        const routesConfigured =
            pagesConfigured || apiConfigured || wsConfigured;

        // If routes were configured, start the server
        if (routesConfigured) {
            // Start the server
            const fetchHandler: FetchHandler = this.dynamicRouter
                ? (request) => this.dynamicRouter!.fetch(request)
                : () => this.notFound();

            // Get WebSocket handlers and fetch handler if adapter is configured
            const wsOptions = this.wsAdapter?.createWebSocketOption();
            const wsAdapter = this.wsAdapter;

            // Create a combined fetch handler:
            // 1. Try WebSocket upgrade first (if wsAdapter exists)
            // 2. Fall through to HTTP only when the request was NOT consumed.
            const combinedFetch: FetchHandler = wsAdapter
                ? async (request, server) => {
                      const outcome = await wsAdapter.handleUpgrade(
                          request,
                          server
                      );
                      if (outcome.handled) {
                          // The socket was taken over (Bun hijacks it and
                          // returns 101 itself) or the platform produced the
                          // protocol response (404 / auth rejection / 101).
                          // Either way the HTTP pipeline must NOT run.
                          return outcome.response as unknown as Response;
                      }
                      return fetchHandler(request);
                  }
                : fetchHandler;

            await this.server.start({
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

    /**
     * Node WebSocket integration: returns a bridge that plugs the framework
     * pipeline into node:http's `'upgrade'` event using a framing library's
     * `WebSocketServer` (e.g. the `ws` package). Requires WebSocket routes
     * to be configured (`wsDir`, `wsRoutes`, or `burger.websocket()`).
     *
     * ```ts
     * import http from 'node:http';
     * import { WebSocketServer } from 'ws';
     *
     * const bridge = burger.createNodeWsBridge({ WebSocketServer });
     * http.createServer((req, res) => toFetchHandler(burger)(req, undefined))
     *     .on('upgrade', (req, socket, head) =>
     *         bridge.handleUpgrade(req, socket, head))
     *     .listen(3000);
     * ```
     */
    public createNodeWsBridge(options: NodeWsBridgeOptions): NodeWsBridge {
        if (!this.wsAdapter) {
            throw new Error(
                '[burger-api] createNodeWsBridge requires WebSocket routes ' +
                    '(wsDir / wsRoutes / burger.websocket()).'
            );
        }
        return this.wsAdapter.createNodeWsBridge(options);
    }
}

/**
 * Merges global and per-route WebSocket config. `auth` is merged deeply
 * so a route-level `auth: { roles: [...] }` keeps a global
 * `auth: { required: true }`; either side being `false` disables auth.
 */
/**
 * Connection-level WebSocket options (`maxPayloadLength`, `idleTimeout`,
 * `compression`, …) are Bun.serve-wide — a route-level value cannot override
 * what Bun enforces for the whole server. Warn loud instead of silently
 * ignoring the author's intent. (Auth and other per-route keys are honored.)
 */
const WS_TRANSPORT_KEYS = [
    'maxPayloadLength',
    'idleTimeout',
    'backpressureLimit',
    'closeOnBackpressureLimit',
    'compression',
] as const;

function warnTransportLevelWsConfig(
    path: string,
    config?: Record<string, unknown>
): void {
    if (!config) return;
    for (const key of WS_TRANSPORT_KEYS) {
        if (config[key] !== undefined) {
            console.warn(
                `[burger-api] WebSocket route "${path}": config.${key} is ` +
                    'connection-level and can only be set globally via ' +
                    'burger.wsConfig() — the per-route value is ignored.'
            );
        }
    }
}

function mergeWsConfig(
    globalConfig: WebSocketConfig | undefined,
    routeConfig: WebSocketConfig | undefined
): WebSocketConfig {
    const merged: WebSocketConfig = {
        ...globalConfig,
        ...routeConfig,
    };
    const globalAuth = globalConfig?.auth;
    const routeAuth = routeConfig?.auth;
    if (globalAuth !== undefined || routeAuth !== undefined) {
        merged.auth =
            globalAuth === false || routeAuth === false
                ? false
                : {
                      ...(typeof globalAuth === 'object' ? globalAuth : {}),
                      ...(typeof routeAuth === 'object' ? routeAuth : {}),
                  };
    }
    return merged;
}

// Export BurgerContext (the public request context type)
export { BurgerContext } from './context/context.js';
export type {
    BurgerServices,
    BurgerValidated,
    BurgerEnv,
    BurgerExecutionContext,
} from './context/context.js';

// Export utils used by examples and CLI build pipeline
export { setDir } from './utils/index.js';
export { cleanPrefix, normalizePath } from './utils/index.js';

// Export constant-time comparison (used by ecosystem auth plugins)
export { timingSafeEqual } from './utils/timing-safe.js';

// Export error classes
export { HTTPError, renderHTTPError } from './errors/http-error.js';
export { ASSET_MIME, contentTypeFor } from './core/assets.js';
export type {
    EmbeddedAsset,
    DiskAssetRoute,
} from './core/assets.js';
export { ValidationError } from './validation/error.js';
export { NotFoundError } from './errors/not-found.js';
export { UnauthorizedError } from './errors/unauthorized.js';
export { ForbiddenError } from './errors/forbidden.js';
export { MethodNotAllowedError } from './errors/method-not-allowed.js';

// Export docs providers
export { scalarDocs, swaggerDocs, redocDocs } from './core/docs-providers.js';

// Export the Web-Standard (WinterCG) fetch entry
export { toFetchHandler } from './adapter/web-standard/index.js';
export type { FetchHandlerEntry } from './adapter/web-standard/index.js';

// Export adapter contract types
export type {
    RuntimeAdapter,
    AdapterStartOptions,
    ServerHandle,
} from './adapter/types.js';
export type { BunAdapterStartOptions } from './adapter/bun/types.js';
export type { ServerInfo } from './types/index.js';

// Export public types
export type {
    ServerOptions,
    RequestHandler,
    BurgerNext,
    RouteDefinition,
    RouteSchema,
    MethodSchema,
    RouteConfig,
    BuildConfig,
    FetchHandler,
    EnvFetchHandler,
    PageDefinition,
    openapi,
    OpenAPIMeta,
    RouteHooks,
    GlobalHooks,
    TransformMap,
    ContextSet,
    RouteMeta,
    OpenAPIConfig,
    DocsAuth,
    DocsProvider,
    OpenAPIObject,
} from './types/index.js';

// The Server class returned by `getServer()` — exported as a type so callers
// can name it.
export type { Server } from './core/server.js';

// Export HTTP method unions (used by typed route definition keys)
export type { HTTPMethod, LowercaseHTTPMethod } from './utils/routing.js';

// Export lifecycle types
export type {
    Hook,
    ForwardHook,
    ForwardHookResult,
    ResponseHook,
    ResponseHookResult,
    ErrorHook,
} from './lifecycle/types.js';

// Export validation types
export type { ValidationIssue } from './validation/types.js';

// Export plugin types
export type { Plugin } from './plugin/types.js';
export type { Scope } from './chain/node.js';

// Export WebSocket types
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
} from './ws/types.js';

export {
    WebSocketReadyState,
    WebSocketCloseCode,
    BurgerWSContext,
} from './ws/types.js';

export { WebSocketAdapter } from './ws/adapter.js';
export type { WebSocketAdapterOptions } from './ws/adapter.js';
