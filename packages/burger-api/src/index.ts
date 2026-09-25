// Import stuff from core
import { Server } from './core/server.js';
import { timingSafeEqual } from './utils/timing-safe.js';

// Import router
import { Router } from './router/index.js';
import { extractCtxInit } from './router/param-extract.js';
import {
    BurgerContext,
    isRequestIPSource,
    setRequestIP,
} from './context/context.js';

// Import utils
import { collectRoutes, compareRoutes, setDir } from './utils/index.js';
import { notFound, openApiError } from './utils/response.js';
import { lowercaseMethodKeys } from './utils/routing.js';
import { warnUnknownHookExports } from './compiler/conventions.js';

// Import plugin system
import { PluginRegistry } from './plugin/registry.js';
import type { Plugin, PluginFactory } from './plugin/types.js';
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
    RouteSchema,
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

/**
 * The narrow surface passed to a `plugins.ts` default export — deliberately
 * excludes the rest of `Burger`. `serve()`/`fetchHandler()` would re-enter
 * route compilation if called this early (the app is still mid-construction
 * at this point — `routesProcessed` isn't set until after `plugins.ts` runs,
 * so the reentrancy guard doesn't stop it); `createNodeWsBridge()` throws
 * unconditionally here (`wsAdapter` doesn't exist yet); `websocket()`/
 * `wsConfig()` are a different concern (WS route registration, not plugin
 * setup). Structurally compatible with `Burger` — this is a type-level
 * restriction only, not a runtime wrapper.
 *
 * Hand-written (not `Pick<Burger, 'usePlugin'>`) so `this` stays polymorphic:
 * an indexed-access type (`Burger['usePlugin']`) would concretize `this` to
 * the full `Burger` instance at extraction time, so a chained call's result
 * would show the entire `Burger` surface again — defeating the narrowing.
 */
export interface PluginRegistrar {
    usePlugin(
        plugin: Plugin | PluginFactory,
        scope?: Scope,
        seed?: string
    ): this;
}

/**
 * The narrow surface passed to a `providers.ts` default export. See
 * {@link PluginRegistrar} for why the rest of `Burger` is excluded and why
 * this is hand-written rather than derived via indexed access.
 */
export interface ProviderRegistrar {
    provide(name: string, service: unknown): this;
}

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

    /** Set once page + asset routes are registered (serve / fetchHandler). */
    private pagesProcessed?: Promise<boolean>;

    /** Set when the scanned API directory contained no route files. */
    private emptyApiDir?: string;

    /** Set once convention directory defaults were applied. */
    private conventionDefaultsApplied = false;

    /**
     * App-level WebSocket hooks (`onOpen` / `onMessage` / `onClose` from
     * `src/hooks.ts` / `globalHooks`), applied to every WS route.
     */
    private globalWsHooks?: import('./ws/types.js').WebSocketHooks;

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
        // `??`, not `||`: an explicit `apiPrefix: ''` mounts routes at `/`.
        this.apiPrefix = apiPrefix ?? 'api';

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
     * (resolved name + seed — factories are resolved first) is deduplicated:
     * a second registration with the same identity is ignored with a warning.
     *
     * @param plugin The plugin object or a factory function returning one.
     * @param scope Optional scope override (default: `'plugin'`).
     * @param seed Optional disambiguation string (e.g. two JWT plugins).
     * @returns `this` for chaining.
     */
    usePlugin(
        plugin: Plugin | PluginFactory,
        scope?: Scope,
        seed?: string
    ): this {
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
     * Filesystem mode only (no prebuilt `apiRoutes`): directories the app
     * did not configure default to the CLI build's conventions —
     * `src/api`, `src/pages`, `src/websocket` — when they exist, so dev and
     * production mount the same routes. Resolved lazily (the resolver
     * touches `node:fs`, which AOT bundles never load).
     */
    private async applyConventionDefaults(): Promise<void> {
        if (this.conventionDefaultsApplied) return;
        this.conventionDefaultsApplied = true;
        if (Array.isArray(this.options.apiRoutes)) return;
        const needsApi = !this.apiDir;
        const needsPages =
            !this.pageDir && !Array.isArray(this.options.pageRoutes);
        const needsWs = !this.wsDir && !Array.isArray(this.options.wsRoutes);
        if (!needsApi && !needsPages && !needsWs) return;
        const { resolveConventionDir } = await import('./utils/fs.js');
        if (needsApi) this.apiDir = resolveConventionDir('api');
        if (needsPages) this.pageDir = resolveConventionDir('pages');
        if (needsWs) this.wsDir = resolveConventionDir('websocket');
    }

    /**
     * Wraps a non-API handler (page, asset, OpenAPI spec, docs UI) so
     * global/plugin `onRequest` hooks run for it like for API routes.
     * Registered on the native routes map → invoked with the raw `Request`.
     */
    private withOnRequest(
        handler: (request: Request) => Response | Promise<Response>
    ): RequestHandler {
        // Non-function values (Bun HTML-import bundles in AOT pageRoutes)
        // are served natively by Bun and cannot be wrapped.
        const wrapped =
            this.dynamicRouter && typeof handler === 'function'
                ? this.dynamicRouter.wrapWithOnRequest(handler)
                : handler;
        return wrapped as unknown as RequestHandler;
    }

    /** Registers page + asset routes once (shared by serve and fetchHandler). */
    private processPageRoutesOnce(): Promise<boolean> {
        return (this.pagesProcessed ??= this.processPageRoutes());
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
                this.routes[page.path] = this.withOnRequest(
                    this.wrapPageHandler(page.handler, page.path) as never
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
                this.routes[page.path] = this.withOnRequest(
                    this.wrapPageHandler(page.handler, page.path) as never
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
            const { embeddedAssetHandler } = await import(
                './core/embedded-assets.js'
            );
            for (const asset of prebuiltAssets) {
                this.routes[asset.path] = this.withOnRequest(
                    embeddedAssetHandler(asset) as never
                );
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
            this.routes[route.routePath] = this.withOnRequest(
                diskAssetHandler(route) as never
            );
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
        // Global hooks other than onRequest — compiled into every route with
        // scope 'global' (identical ordering in dev and AOT).
        let globalRouteHooks: RouteHooks | undefined;
        if (Array.isArray(this.options.apiRoutes)) {
            // AOT routes may carry `schema.ts` / `openapi.ts` namespaces with
            // uppercase method keys (GET/POST) — normalize once to the
            // lowercase form the compiler and OpenAPI generator read.
            apiRoutes = this.options.apiRoutes
                .map((def) => ({
                    ...def,
                    schema: def.schema
                        ? (lowercaseMethodKeys(def.schema) as RouteSchema)
                        : def.schema,
                    openapi: def.openapi
                        ? (lowercaseMethodKeys(def.openapi) as RouteDefinition['openapi'])
                        : def.openapi,
                }))
                .sort((a, b) => compareRoutes(a, b));
            // Production: accept config from ServerOptions if provided
            this.openAPIConfig = this.options.openapi;

            // Production: resolve global hooks from options (a module
            // namespace or its default-export object, like the dev loader).
            const rawGlobal = this.options.globalHooks;
            const globalHooks =
                rawGlobal &&
                typeof rawGlobal.default === 'object' &&
                rawGlobal.default !== null
                    ? (rawGlobal.default as Record<string, unknown>)
                    : rawGlobal;
            if (globalHooks) {
                warnUnknownHookExports(globalHooks, 'src/hooks', 'global');
                const { onRequest, ...rest } = globalHooks;
                if (onRequest) {
                    globalOnRequest = Array.isArray(onRequest)
                        ? (onRequest as import('./lifecycle/types.js').Hook[])
                        : [onRequest as import('./lifecycle/types.js').Hook];
                }
                globalRouteHooks = rest as RouteHooks;
                this.globalWsHooks = pickWsHooks(globalHooks);
            }
            for (const def of apiRoutes) {
                warnUnknownHookExports(
                    def.hooks as Record<string, unknown> | undefined,
                    `${def.path} hooks`,
                    'route'
                );
            }

            // Production: execute plugins module if provided
            const pluginsMod = this.options.pluginsModule;
            if (pluginsMod) {
                const defaultFn = (pluginsMod as any).default;
                if (typeof defaultFn === 'function') {
                    await (
                        defaultFn as (
                            burger: PluginRegistrar
                        ) => void | Promise<void>
                    )(this);
                }
            }

            // Production: execute providers module if provided
            const providersMod = this.options.providersModule;
            if (providersMod) {
                const defaultFn = (providersMod as any).default;
                if (typeof defaultFn === 'function') {
                    await (
                        defaultFn as (
                            burger: ProviderRegistrar
                        ) => void | Promise<void>
                    )(this);
                }
            }
        } else {
            // Dev path: Route Module pipeline
            // (Directory Scanner → Module Loader → RouteModule → Compiler).
            // Loaded lazily: production AOT builds ship prebuilt apiRoutes
            // and never evaluate these filesystem modules.
            await this.applyConventionDefaults();
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
            globalRouteHooks = scanned.globalRouteHooks;
            this.globalWsHooks = pickWsHooks(
                scanned.globalRouteHooks as Record<string, unknown> | undefined
            );
            if (modules.length === 0) this.emptyApiDir = this.apiDir;

            // Load openapi.config.ts if discovered
            this.openAPIConfig = await loader.loadOpenAPIConfig(scanned);

            // Load and execute plugins.ts (auto-discovered at app root)
            const pluginsFn = await loader.loadPlugins(scanned);
            if (typeof pluginsFn === 'function') {
                await (
                    pluginsFn as (
                        burger: PluginRegistrar
                    ) => void | Promise<void>
                )(this);
            }

            // Load and execute providers.ts (auto-discovered at app root)
            const providersFn = await loader.loadProviders(scanned);
            if (typeof providersFn === 'function') {
                await (
                    providersFn as (
                        burger: ProviderRegistrar
                    ) => void | Promise<void>
                )(this);
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

        router.compile(
            apiRoutes,
            allHooks,
            this.providers,
            onRequestHooks,
            globalRouteHooks
        );
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

            const expectedAuth = config?.docsAuth
                ? 'Basic ' +
                  btoa(
                      `${config.docsAuth.username}:${config.docsAuth.password}`
                  )
                : null;
            // docsAuth guards the spec as well as the UI — protecting only the
            // HTML page would leave the full API description public. Browsers
            // resend the Basic credentials to the spec URL automatically.
            const unauthorized = (
                ctx: { headers?: Headers } | undefined
            ): Response | null => {
                if (expectedAuth === null) return null;
                const authHeader = ctx?.headers?.get?.('authorization') ?? '';
                if (timingSafeEqual(authHeader, expectedAuth)) return null;
                return new Response('Unauthorized', {
                    status: 401,
                    headers: {
                        'WWW-Authenticate': 'Basic realm="Documentation"',
                    },
                });
            };

            // Invoked with the raw `Request` (native routes map); wrapped so
            // global/plugin onRequest hooks (CORS, auth, …) apply here too.
            this.routes[specPath] = this.withOnRequest((request: Request) =>
                unauthorized(request) ??
                (this.openApiDoc
                    ? Response.json(this.openApiDoc)
                    : this.openApiError())
            );

            // Docs UI: use configured provider or default to Swagger UI (loaded
            // lazily — only needed when the docs route is registered).
            const { swaggerDocs } = await import('./core/docs-providers.js');
            const provider: DocsProvider = config?.provider ?? swaggerDocs();
            this.routes[docsPath] = this.withOnRequest((request: Request) => {
                const denied = unauthorized(request);
                if (denied) return denied;

                const result = provider(this.openApiDoc!, { specUrl: specPath });
                if (result instanceof Response) return result;
                return new Response(result, {
                    headers: { 'Content-Type': 'text/html' },
                });
            });
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
            runtimeTarget: this.options.runtimeTarget,
        });

        // App-level WS hooks apply to every WS route (programmatic,
        // prebuilt and file-based alike).
        const globalWs = this.globalWsHooks;
        const mergeWsHooks = globalWs
            ? (await import('./ws/compiler.js')).mergeWsHooks
            : undefined;
        const withGlobalWs = (
            hooks: import('./ws/types.js').WebSocketHooks | undefined
        ) => (mergeWsHooks ? mergeWsHooks(globalWs, hooks) : hooks);

        // Add programmatic routes
        for (const [path, route] of this.programmaticWsRoutes) {
            this.wsRouter.addRoute({
                path,
                handlers: route.handlers,
                hooks: withGlobalWs(undefined),
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
                    hooks: withGlobalWs(route.hooks),
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

                // Set global hooks if found (the hooks.ts beside wsDir, else
                // the app-level hooks already loaded for API routes).
                if (!scanResult.globalHooks && globalWs) {
                    compiler.setGlobalHooks(globalWs);
                }
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
        await this.processPageRoutesOnce();

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

        // Direct lookups are exact static paths only: native pattern keys
        // (`/api/items/:id`, dynamic pages) must never match literally —
        // dynamic API routes dispatch through `router.fetch`. Bun-only page
        // values (HTML-import bundles) and dynamic pages are not portable:
        // warn once instead of silently 404ing.
        const routes = new Map<string, RequestHandler>();
        const bunOnlyPages: string[] = [];
        const apiPatterns = new Set(
            Object.keys(this.dynamicRouter?.nativeRoutes() ?? {})
        );
        for (const [key, handler] of Object.entries(this.routes)) {
            if (apiPatterns.has(key)) continue;
            if (
                typeof handler !== 'function' ||
                key.includes(':') ||
                key.includes('*')
            ) {
                bunOnlyPages.push(key);
                continue;
            }
            routes.set(key, handler);
        }
        if (bunOnlyPages.length > 0) {
            console.warn(
                `[burger-api] ${bunOnlyPages.length} page route(s) are only served by serve() on Bun ` +
                    `(HTML-import bundles / dynamic pages) and will 404 through fetchHandler()/toFetchHandler(): ` +
                    bunOnlyPages.join(', ')
            );
        }
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
            const handler = routes.get(pathname);
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
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
            throw new Error(
                `[burger-api] Invalid port ${JSON.stringify(port)} — expected an integer from 0 to 65535.`
            );
        }
        // Process API routes first so convention files (plugins.ts, providers.ts)
        // are loaded before WebSocket reads the registries (avoids race).
        const apiConfigured = await this.processApiRoutes();
        const [pagesConfigured, wsConfigured] = await Promise.all([
            this.processPageRoutesOnce(),
            this.processWebSocketRoutes(),
        ]);

        // Flag to track if any routes were loaded
        const routesConfigured =
            pagesConfigured || apiConfigured || wsConfigured;

        // If routes were configured, start the server
        if (routesConfigured) {
            // Start the server
            // The adapter passes its server handle: record it as the
            // request's peer-address source for `ctx.ip`.
            const fetchHandler: FetchHandler = this.dynamicRouter
                ? (request, server) => {
                      if (isRequestIPSource(server)) {
                          setRequestIP(request, server);
                      }
                      return this.dynamicRouter!.fetch(request);
                  }
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
                      return fetchHandler(request, server);
                  }
                : fetchHandler;

            // A WS route on the same path as a static HTTP route is
            // unreachable: Bun's static routes answer before the upgrade.
            for (const wsRoute of this.wsRouter?.getRoutes() ?? []) {
                if (this.routes[wsRoute.path]) {
                    console.warn(
                        `[burger-api] WebSocket route "${wsRoute.path}" is shadowed by an HTTP route on the same path — upgrades never reach it. Move one of them.`
                    );
                }
            }

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
                this.emptyApiDir
                    ? `Error: No routes configured — the API directory "${this.emptyApiDir}" has no route files. ` +
                          'Each endpoint is a folder with a route.ts, e.g. src/api/hello/route.ts: ' +
                          'export async function GET(ctx) { return Response.json({ hello: "world" }); }'
                    : 'Error: No routes configured! Please provide apiDir/pageDir (for dev) or apiRoutes/pageRoutes (for production builds) when initializing the Burger class.'
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
     * to be configured (`wsDir`, `wsRoutes`, or `burger.websocket()`) — and
     * for that route processing to have already run at least once, so
     * `await`/call `fetchHandler()` (or `serve()`) first, not after.
     *
     * ```ts
     * import http from 'node:http';
     * import { WebSocketServer } from 'ws';
     *
     * const fetchHandler = await burger.fetchHandler();
     * const bridge = burger.createNodeWsBridge({ WebSocketServer });
     * http.createServer((req, res) => { ... })
     *     .on('upgrade', (req, socket, head) =>
     *         bridge.handleUpgrade(req, socket, head))
     *     .listen(3000);
     * ```
     */
    public createNodeWsBridge(options: NodeWsBridgeOptions): NodeWsBridge {
        if (!this.wsAdapter) {
            throw new Error(
                this.routesProcessed
                    ? '[burger-api] createNodeWsBridge(): no WebSocket routes are configured — ' +
                          'add wsDir / wsRoutes / burger.websocket() first.'
                    : '[burger-api] createNodeWsBridge() was called too early. Call it after ' +
                          '`const fetch = await burger.fetchHandler();` (or `await burger.serve()`) — ' +
                          'WebSocket routes are processed there.'
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

/** Picks the WebSocket hooks out of an app-level hooks object. */
function pickWsHooks(
    hooks: Record<string, unknown> | undefined
): import('./ws/types.js').WebSocketHooks | undefined {
    if (!hooks) return undefined;
    const { onOpen, onMessage, onClose } = hooks;
    if (!onOpen && !onMessage && !onClose) return undefined;
    return { onOpen, onMessage, onClose } as import('./ws/types.js').WebSocketHooks;
}

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
export { BurgerContext, setRequestIP } from './context/context.js';

// Export the schema-typed route/hooks helpers
export { defineRoute, defineHooks } from './router/define.js';
export type {
    TypedRouteHooks,
    HookContext,
    PreValidationHookContext,
} from './router/define.js';

// Export the runtime-capability model (single source of truth for the CLI
// build's per-target validation and the docs compatibility page)
export { RUNTIME_CAPABILITIES } from './runtime/capabilities.js';
export type { RuntimeTarget, RuntimeCapability } from './runtime/capabilities.js';
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
export { ASSET_MIME, contentTypeFor } from './core/asset-mime.js';
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
    DocsProviderOptions,
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
export type { Plugin, PluginFactory } from './plugin/types.js';
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
