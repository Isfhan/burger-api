// Import stuff from core
import { Server } from './core/server.js';
import { timingSafeEqual } from './utils/timing-safe.js';

// Import router
import { Router } from './router/index.js';
import {
    compilePatternSegments,
    extractCtxInitWithSegments,
} from './router/param-extract.js';
import { BurgerContext } from './context/context.js';
import type { NativeMethodHandlers } from './router/types.js';

// Import utils
import { collectRoutes, compareRoutes, setDir } from './utils/index.js';
import { notFound, openApiError } from './utils/response.js';
import { extractPathnameFromUrl } from './utils/wildcard.js';
import { lowercaseMethodKeys } from './utils/routing.js';
import {
    requireDefaultFunctionExport,
    warnUnknownHookExports,
} from './compiler/conventions.js';

// Import plugin system
import { PluginRegistry } from './plugin/registry.js';
import type { Plugin, PluginFactory } from './plugin/types.js';
import type { Scope } from './chain/node.js';

// Import WebSocket router/adapter (scanner/compiler load lazily on the dev
// filesystem path only).
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
 * The narrow surface passed to a `plugins.ts` default export: only
 * `usePlugin()`. Registration runs mid-construction, so `serve()` /
 * `fetchHandler()` etc. are deliberately excluded. Hand-written so `this`
 * stays polymorphic for chained calls (a type-level restriction only).
 */
export interface PluginRegistrar {
    usePlugin(
        plugin: Plugin | PluginFactory,
        scope?: Scope,
        seed?: string
    ): this;
}

/**
 * The narrow surface passed to a `providers.ts` default export — see
 * {@link PluginRegistrar}.
 */
export interface ProviderRegistrar {
    provide(name: string, service: unknown): this;
}

export class Burger {
    /**
     * The server instance
     */
    private server: Server;

    /** The resolved API directory (dev path). */
    private apiDir?: string;

    /**
     * The API path prefix (dev path).
     */
    private apiPrefix: string = 'api';

    /** Page router (dev path only, created lazily). */
    private pageRouter?: import('./core/page-router.js').PageRouter;

    /** The page directory (dev path). */
    private pageDir?: string;

    /**
     * The page path prefix (dev path).
     */
    private pagePrefix = '';

    /**
     * The compiled API router: static dispatch (Bun map) plus dynamic and
     * wildcard dispatch (trie).
     */
    private dynamicRouter?: Router;

    /** Structural route tree for introspection/ordering; not on the hot path. */
    private routeTree?: import('./compiler/route-tree.js').RouteTree;

    /** Plugin registry, populated via `.usePlugin()` before `serve()`. */
    private pluginRegistry = new PluginRegistry();

    /**
     * Pre-routing onRequest hooks (Framework → Plugin → Global) resolved at
     * compile time; shared with the WebSocket upgrade chain so both paths run
     * the same hooks.
     */
    private onRequestHooks: import('./lifecycle/types.js').Hook[] = [];

    /**
     * App-level (`src/hooks.ts`) route hooks, retained so WebSocket upgrades
     * run the same transform/beforeRoute chain as HTTP.
     */
    private globalRouteHooks?: RouteHooks;

    /** Services from `burger.provide()`, injected into `ctx.services`. */
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
     * The routes object. API routes are per-method objects (`{ GET, … }`);
     * page/asset/docs routes are plain request handlers.
     */
    private routes: {
        [key: string]: RequestHandler | NativeMethodHandlers;
    } = {};

    /**
     * Every compiled API path (static + dynamic). Used by `fetchHandler()`
     * to tell API routes apart from Bun-only page entries in `routes`.
     */
    private apiRoutePaths?: Set<string>;

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
     * App-level WebSocket hooks (`onOpen` / `onMessage` / `onClose`),
     * applied to every WS route.
     */
    private globalWsHooks?: import('./ws/types.js').WebSocketHooks;

    /**
     * @param options Server + router options (port, apiDir, pageDir, wsDir, …).
     */
    constructor(private options: ServerOptions) {
        // Adapter seam: injectable for tests/embed, else Bun loads lazily.
        this.server = new Server(options, options.adapter);

        const { apiDir, apiPrefix, wsDir } = options;

        this.apiDir = apiDir;
        // `??`, not `||`: an explicit `apiPrefix: ''` mounts routes at `/`.
        this.apiPrefix = apiPrefix ?? 'api';

        // Pages resolve lazily on the dev scan path, keeping AOT bundles small.
        this.pageDir = options.pageDir;
        this.pagePrefix = options.pagePrefix ?? '';

        this.wsDir = wsDir;
    }

    /**
     * Registers a plugin; its hooks compile into every route's hook chain with
     * the plugin's scope. Duplicate registrations (same name + seed) are
     * ignored with a warning.
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
     * Registers an application service, injected into `ctx.services` for every
     * request.
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
     * Filesystem mode only (no prebuilt `apiRoutes`): unconfigured directories
     * default to the CLI build conventions (`src/api`, `src/pages`,
     * `src/websocket`) when they exist, so dev and production match. Resolved
     * lazily — `node:fs` is never loaded by AOT bundles.
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
        // Non-function values (Bun HTML-import bundles) are served natively,
        // not wrapped.
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

    /** Loads prebuilt or filesystem page routes. */
    private async processPageRoutes(): Promise<boolean> {
        // Production path: use pre-built page routes (no filesystem scan)
        const prebuiltPages = this.options.pageRoutes;
        let hasPages = false;
        if (Array.isArray(prebuiltPages)) {
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
            // Dev path: lazy-load the page router (AOT bundles ship prebuilt
            // pageRoutes, so this module is never evaluated).
            const { PageRouter } = await import('./core/page-router.js');
            const pageRouter = new PageRouter(this.pageDir, this.pagePrefix);
            this.pageRouter = pageRouter;

            await pageRouter.loadPages();
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
     * Wraps a dynamic page handler with a per-request `BurgerContext` (Bun
     * matches `:param` patterns but does not expose the params); static pages
     * pass through unchanged.
     */
    private wrapPageHandler(
        handler: RequestHandler,
        path: string
    ): RequestHandler {
        if (!path.includes(':')) return handler;
        // Compile the pattern's segments once per route, not per request.
        const compiledPattern = compilePatternSegments(path);
        // Invoked with the raw `Request`, like `fetchHandler`'s static dispatch.
        const wrapped = async (request: Request): Promise<Response> => {
            const ctxInit = extractCtxInitWithSegments(
                request,
                path,
                compiledPattern
            );
            const ctx = BurgerContext.create(
                request,
                ctxInit,
                undefined,
                this.dynamicRouter?.getAppServices(),
                undefined,
                undefined,
                undefined,
                this.dynamicRouter?.getRequestIPHolder()
            );
            return handler(ctx);
        };
        return wrapped as unknown as RequestHandler;
    }

    /**
     * Registers static asset routes under `{pagePrefix}/assets/*`.
     *
     * Production AOT embeds base64 contents (`assetRoutes` from the CLI
     * build); dev reads files from disk per request so edits show.
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
     * Compiles the API routes and merges them into the routes map. Static and
     * dynamic (`:param` / `*`) routes both go on Bun's native map; unmatched or
     * loose-trailing-slash requests fall through to `Router.fetch` (the trie).
     * Both paths run the same compiled handler, so dispatch behavior is
     * identical.
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
            // AOT routes may carry uppercase method keys (GET/POST) in
            // `schema` / `openapi`; normalize once for the compiler and
            // OpenAPI generator. `config` keeps its uppercase method keys.
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
        } else {
            // Dev path: Scanner → Module Loader → RouteModule → Compiler,
            // loaded lazily (AOT builds ship prebuilt apiRoutes). App-level
            // convention files load even for pages-only apps (no apiDir).
            await this.applyConventionDefaults();
            let scanned:
                | import('./compiler/route-module.js').ScanResult
                | undefined;
            if (this.apiDir) {
                const { DirectoryScanner } = await import(
                    './compiler/scanner.js'
                );
                scanned = await new DirectoryScanner(
                    this.apiDir,
                    this.apiPrefix
                ).scan();
            } else {
                const { scanAppRootConventions } = await import(
                    './compiler/scanner.js'
                );
                const { resolveAppRootDir } = await import('./utils/fs.js');
                const appRoot = resolveAppRootDir();
                if (appRoot) scanned = await scanAppRootConventions(appRoot);
            }

            if (scanned) {
                const { ModuleLoader } = await import(
                    './compiler/module-loader.js'
                );
                const loader = new ModuleLoader();
                const modules = await loader.load(scanned);
                globalOnRequest = scanned.globalOnRequest;
                globalRouteHooks = scanned.globalRouteHooks;
                this.globalWsHooks = pickWsHooks(
                    scanned.globalRouteHooks as
                        | Record<string, unknown>
                        | undefined
                );
                if (this.apiDir && modules.length === 0) {
                    this.emptyApiDir = this.apiDir;
                }

                // Load openapi.config.ts if discovered
                this.openAPIConfig = await loader.loadOpenAPIConfig(scanned);

                // Load and execute plugins.ts / providers.ts (app root). A
                // present file with no default function export fails loud.
                const pluginsMod = await loader.loadPlugins(scanned);
                if (pluginsMod) {
                    await (
                        pluginsMod.default as (
                            burger: PluginRegistrar
                        ) => void | Promise<void>
                    )(this);
                }
                const providersMod = await loader.loadProviders(scanned);
                if (providersMod) {
                    await (
                        providersMod.default as (
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
            } else {
                apiRoutes = [];
            }
        }

        // Production: execute the pre-resolved plugins/providers modules.
        // Runs for pages-only AOT apps too (no apiRoutes array). A module
        // present without a default function export fails loud.
        if (this.options.pluginsModule) {
            const fn = requireDefaultFunctionExport(
                this.options.pluginsModule,
                'plugins.ts'
            );
            await (fn as (burger: PluginRegistrar) => void | Promise<void>)(
                this
            );
        }
        if (this.options.providersModule) {
            const fn = requireDefaultFunctionExport(
                this.options.providersModule,
                'providers.ts'
            );
            await (fn as (burger: ProviderRegistrar) => void | Promise<void>)(
                this
            );
        }

        // API routes are optional: the router is still built so hooks, the `ip`
        // holder and app services reach pages, assets and docs.
        const hasApiRoutes = apiRoutes.length > 0;

        const config = this.openAPIConfig;
        const openapiEnabled = config?.enabled !== false;

        // Generate the OpenAPI document lazily and only when docs are enabled.
        if (hasApiRoutes && openapiEnabled) {
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
        // Resolve plugins into a single list for the compiler.
        const allHooks = await this.pluginRegistry.resolveAll();

        // onRequest hooks run before routing, not as per-route HookPlan
        // entries. Order: Framework → Plugin → Global (src/hooks.ts) → Route.
        const onRequestHooks: import('./lifecycle/types.js').Hook[] = [];
        for (const plugin of allHooks) {
            const h = plugin.hooks.onRequest;
            if (h) {
                if (Array.isArray(h)) onRequestHooks.push(...h);
                else onRequestHooks.push(h);
            }
        }
        onRequestHooks.push(...(globalOnRequest ?? []));
        this.onRequestHooks = onRequestHooks;
        this.globalRouteHooks = globalRouteHooks;

        router.compile(
            apiRoutes,
            allHooks,
            this.providers,
            onRequestHooks,
            globalRouteHooks
        );
        this.dynamicRouter = router;

        // Only the onRequest machinery was needed (pages/assets/docs); there
        // is no route table to merge and no OpenAPI document to serve.
        if (!hasApiRoutes) {
            this.routesProcessed = true;
            return false;
        }

        // Merge static and dynamic routes onto Bun's native routes map (Bun
        // matches `:param` / `*` directly); unmatched requests fall through to
        // `Router.fetch` (the trie).
        Object.assign(this.routes, router.staticRoutes());
        Object.assign(this.routes, router.nativeRoutes());
        this.apiRoutePaths = new Set([
            ...Object.keys(router.staticRoutes()),
            ...Object.keys(router.nativeRoutes()),
        ]);

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
            // docsAuth guards the spec as well as the UI: protecting only the
            // HTML page would leave the API description public.
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

            // Docs UI: configured provider, or Swagger UI by default (loaded
            // lazily).
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

    /** Loads WebSocket routes (programmatic, prebuilt or file-based). */
    private async processWebSocketRoutes(): Promise<boolean> {
        this.wsRouter = new WebSocketRouter();

        // Extract auth hooks from resolved plugins for WebSocket upgrade.
        // beforeRoute follows the HTTP order: Framework → Plugin → Global.
        const resolvedPlugins = await this.pluginRegistry.resolveAll();
        let pluginTransform:
            import('./lifecycle/types.js').TransformMap | undefined;
        const pluginBeforeRoute: import('./lifecycle/types.js').Hook[] = [];
        const frameworkBeforeRoute: import('./lifecycle/types.js').Hook[] = [];
        const toHookArray = (
            value: import('./lifecycle/types.js').Hook | import('./lifecycle/types.js').Hook[]
        ): import('./lifecycle/types.js').Hook[] =>
            Array.isArray(value) ? value : [value];

        for (const plugin of resolvedPlugins) {
            // Collect transform hooks
            if (plugin.hooks.transform) {
                if (!pluginTransform) pluginTransform = {};
                Object.assign(pluginTransform, plugin.hooks.transform);
            }
            // Collect beforeRoute hooks, bucketed by scope.
            if (plugin.hooks.beforeRoute) {
                const hooks = toHookArray(plugin.hooks.beforeRoute);
                if (plugin.scope === 'framework') {
                    frameworkBeforeRoute.push(...hooks);
                } else {
                    pluginBeforeRoute.push(...hooks);
                }
            }
        }

        const globalBeforeRoute = this.globalRouteHooks?.beforeRoute
            ? toHookArray(this.globalRouteHooks.beforeRoute)
            : undefined;

        this.wsAdapter = new WebSocketAdapter({
            router: this.wsRouter,
            config: this.wsConfigOptions,
            debug: this.options.debug,
            providers: this.providers,
            pluginTransform,
            pluginBeforeRoute:
                pluginBeforeRoute.length > 0 ? pluginBeforeRoute : undefined,
            frameworkBeforeRoute:
                frameworkBeforeRoute.length > 0
                    ? frameworkBeforeRoute
                    : undefined,
            onRequestHooks: this.onRequestHooks,
            globalTransform: this.globalRouteHooks?.transform,
            globalBeforeRoute,
            ipHolder: this.dynamicRouter?.getRequestIPHolder(),
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
                    // Deep-merge `auth`, keeping the global `auth.required`.
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

                if (this.wsConfigOptions) {
                    compiler.setGlobalConfig(this.wsConfigOptions);
                }

                const compiledRoutes = await compiler.compileAll(
                    scanResult.routes
                );

                this.wsRouter.addRoutes(compiledRoutes);
            }
        }

        return this.wsRouter.getRouteCount() > 0;
    }

    /**
     * Builds the Web-Standard fetch handler for this app.
     *
     * Dispatches the raw `Request` through the compiled routes (static map
     * first, then the trie fallback for dynamic/wildcard and loose
     * trailing-slash variants). API routes must be provided AOT (`apiRoutes`)
     * or discovered from the filesystem on first call — never per request.
     *
     * Runtime-agnostic: Bun.serve, Deno.serve, Vercel, Cloudflare Workers and
     * Node 24+. WinterCG bindings (`env`, `executionCtx`) are bound onto the
     * per-request `BurgerContext`. Pages (Bun-only) are not served here.
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

        // Direct lookups are exact static page/asset/docs paths only; native
        // pattern keys (`:param`, `*`) must never match literally. Bun-only
        // page values and dynamic pages are not portable: warn instead of
        // silently 404ing.
        const routes = new Map<string, RequestHandler>();
        const bunOnlyPages: string[] = [];
        const apiPaths = this.apiRoutePaths;
        for (const [key, handler] of Object.entries(this.routes)) {
            if (
                typeof handler === 'function' &&
                !key.includes(':') &&
                !key.includes('*')
            ) {
                // Exact static path (page / asset / docs route).
                routes.set(key, handler);
                continue;
            }
            // API routes are per-method objects and dispatch through
            // `router.fetch`; anything else non-callable is Bun-only.
            if (apiPaths?.has(key) !== true) bunOnlyPages.push(key);
        }
        if (bunOnlyPages.length > 0) {
            console.warn(
                `[burger-api] ${bunOnlyPages.length} page route(s) are only served by serve() on Bun ` +
                    `(HTML-import bundles / dynamic pages) and will 404 through fetchHandler()/toFetchHandler(): ` +
                    bunOnlyPages.join(', ')
            );
        }
        const router = this.dynamicRouter;
        // API-only apps (no page/asset/docs routes) skip the page-map lookup
        // entirely: the router parses the pathname once in `fetch`.
        const hasPageRoutes = routes.size > 0;

        /**
         * Shared HTTP dispatch: page/asset routes first, then the API router.
         * The pathname is extracted once and reused for both lookups.
         */
        const dispatchHttp = (
            request: Request,
            env?: import('./context/context.js').BurgerEnv,
            executionCtx?: import('./context/context.js').BurgerExecutionContext
        ): Response | Promise<Response> => {
            if (hasPageRoutes) {
                const pathname = extractPathnameFromUrl(request.url);
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
                if (router) {
                    return router.fetchWithPath(
                        request,
                        pathname,
                        env,
                        executionCtx
                    );
                }
                return this.notFound();
            }
            if (router) return router.fetch(request, env, executionCtx);
            return this.notFound();
        };

        /** Async-only path: a WebSocket upgrade must be awaited. */
        const handleWsUpgrade = async (
            request: Request,
            env?: import('./context/context.js').BurgerEnv,
            executionCtx?: import('./context/context.js').BurgerExecutionContext
        ): Promise<Response> => {
            const outcome = await wsAdapter!.handleUpgrade(
                request,
                undefined,
                env,
                executionCtx
            );
            if (outcome.handled) {
                return (outcome.response ??
                    new Response(null, { status: 101 })) as Response;
            }
            // Not consumed: fall through to the normal HTTP dispatch.
            return dispatchHttp(request, env, executionCtx);
        };

        // No WebSocket adapter: no upgrade probe is needed at all.
        if (!wsAdapter) {
            // API-only app: the router's `fetch` is the entry point (the
            // public contract still returns a Promise).
            if (!hasPageRoutes && router) {
                return (
                    request: Request,
                    env?: import('./context/context.js').BurgerEnv,
                    executionCtx?: import('./context/context.js').BurgerExecutionContext
                ): Promise<Response> =>
                    Promise.resolve(router.fetch(request, env, executionCtx));
            }
            return (
                request: Request,
                env?: import('./context/context.js').BurgerEnv,
                executionCtx?: import('./context/context.js').BurgerExecutionContext
            ): Promise<Response> =>
                Promise.resolve(dispatchHttp(request, env, executionCtx));
        }

        return (
            request: Request,
            env?: import('./context/context.js').BurgerEnv,
            executionCtx?: import('./context/context.js').BurgerExecutionContext
        ): Promise<Response> => {
            // WebSocket upgrades are consumed before HTTP dispatch.
            if (
                request.headers.get('upgrade')?.toLowerCase() === 'websocket'
            ) {
                return handleWsUpgrade(request, env, executionCtx);
            }
            return Promise.resolve(dispatchHttp(request, env, executionCtx));
        };
    }

    /**
     * Starts the server and listens for requests.
     * @param port Port to listen on (default `4000`).
     * @param cb Called when the server is listening.
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

        const routesConfigured =
            pagesConfigured || apiConfigured || wsConfigured;

        if (routesConfigured) {
            // The adapter records its server handle as the lazy `ctx.ip`
            // source (see the `onServer` hook below) — no per-request work.
            const fetchHandler: FetchHandler = this.dynamicRouter
                ? (request) => this.dynamicRouter!.fetch(request)
                : () => this.notFound();

            const wsOptions = this.wsAdapter?.createWebSocketOption();
            const wsAdapter = this.wsAdapter;

            // Combined fetch handler: try the WebSocket upgrade first, then
            // fall through to HTTP only when the request was not consumed.
            const combinedFetch: FetchHandler = wsAdapter
                ? async (request, server) => {
                      // Cheap header probe first: plain HTTP requests (no
                      // `upgrade: websocket`) skip the async upgrade path.
                      if (
                          request.headers.get('upgrade')?.toLowerCase() !==
                          'websocket'
                      ) {
                          return fetchHandler(request, server);
                      }
                      const outcome = await wsAdapter.handleUpgrade(
                          request,
                          server
                      );
                      if (outcome.handled) {
                          // Socket taken over (Bun returns 101 itself) or a
                          // protocol response (404 / auth rejection) — the
                          // HTTP pipeline must NOT run.
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
                onServer: (server) =>
                    this.dynamicRouter?.setRequestIPSource(server),
            });
        } else {
            // Nothing to serve is a startup error, never a silent no-op.
            throw new Error(
                this.emptyApiDir
                    ? `[burger-api] No routes configured — the API directory "${this.emptyApiDir}" has no route files. ` +
                          'Each endpoint is a folder with a route.ts, e.g. src/api/hello/route.ts: ' +
                          'export async function GET(ctx) { return Response.json({ hello: "world" }); }'
                    : '[burger-api] No routes configured! Please provide apiDir/pageDir (for dev) or apiRoutes/pageRoutes (for production builds) when initializing the Burger class.'
            );
        }
    }

    /**
     * The underlying `Server` instance, exposed so callers can stop the
     * server cleanly.
     */
    public getServer(): Server | undefined {
        return this.server;
    }

    /**
     * Node WebSocket integration: returns a bridge that plugs the framework
     * pipeline into node:http's `'upgrade'` event using a framing library's
     * `WebSocketServer` (e.g. the `ws` package). Call `fetchHandler()` (or
     * `serve()`) first — WebSocket routes are processed there.
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
 * Connection-level WebSocket options (`maxPayloadLength`, `idleTimeout`,
 * `compression`, …) are Bun.serve-wide: a route-level value cannot override
 * what Bun enforces for the whole server, so warn loud instead of ignoring it.
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

/**
 * Merges global and per-route config. `auth` is merged deeply so a route-level
 * `auth.roles` keeps a global `auth.required`; either side `false` disables it.
 */
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

// Export the runtime-capability model (used by the CLI build and docs).
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
