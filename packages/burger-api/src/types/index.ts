import type { BurgerContext } from '../context/context';
import type { SchemaInput, ValidatorConfig } from '../validation/types';
import type { RouteHooks, TransformMap } from '../lifecycle/types';
export type { RouteHooks, TransformMap } from '../lifecycle/types';
import type { OpenAPIConfig } from './openapi-config';
import type { RuntimeAdapter } from '../adapter/types';
import type { WebSocketRouteDefinition } from '../ws/types';
import type { HTTPMethod, LowercaseHTTPMethod } from '../utils/routing';

/**
 * Minimal structural view of the running server exposed to `fetch` handlers.
 * The web-standard surface: upgrade a WebSocket upgrade request (Bun) or stop
 * the server. Never references Bun types.
 */
export interface ServerInfo {
    upgrade(request: Request, options?: Record<string, unknown>): boolean;
    stop(): void;
}

/**
 * Framework-level server options. Deliberately Web-Standard: no Bun types.
 * Bun-specific tuning lives on the adapter (`BunAdapterStartOptions`).
 */
export interface ServerOptions {
    /**
     * The title of the API. This is an optional property that can be used
     * to specify a custom title for the API documentation.
     */
    title?: string;

    /**
     * The description of the API. This is an optional property that can be used
     * to provide a brief overview of the API.
     */
    description?: string;

    /**
     * The directory path to load API routes from.
     * If not specified, no API routes are loaded.
     */
    apiDir?: string;

    /**
     * The prefix for the API routes.
     * If not specified, the default prefix is 'api'.
     */
    apiPrefix?: string;

    /**
     * The directory path to load Page routes from.
     * If not specified, no Page routes are loaded.
     * Page routes are not yet supported, but will be supported in the future.
     */
    pageDir?: string;

    /**
     * The prefix for the Page routes.
     * If not specified, the default prefix is 'pages'.
     */
    pagePrefix?: string;

    /**
     * The directory path to load WebSocket routes from.
     * If not specified, no WebSocket routes are loaded.
     */
    wsDir?: string;

    /**
     * The version of the API. This is an optional property that can be used
     * to specify the version of the API.
     */
    version?: string;

    /**
     * Enables or disables debug mode. This is an optional property
     * that, when set to true, can be used to output additional debugging
     * information to the console or logs to aid in development and troubleshooting.
     */
    debug?: boolean;

    /**
     * Pre-built API routes (e.g. from CLI build). When provided, apiDir is ignored
     * and no runtime filesystem scanning is performed. Used for bundled/executable builds.
     */
    apiRoutes?: RouteDefinition[];

    /**
     * Pre-built page routes (e.g. from CLI build). When provided, pageDir is ignored
     * and no runtime filesystem scanning is performed. Used for bundled/executable builds.
     */
    pageRoutes?: PageDefinition[];

    /**
     * Pre-built static asset routes from the CLI build (files under
     * `<pageDir>/assets/` embedded as base64). When present, assets are
     * served from the embedded table; otherwise dev reads them from disk
     * under `pageDir`.
     */
    assetRoutes?: import('../core/assets').EmbeddedAsset[];

    /**
     * Pre-built WebSocket routes (e.g. from CLI build). When provided, wsDir is
     * ignored and no runtime filesystem scanning is performed. Bun-only — wired
     * through `serve()` via the Bun adapter. Used for bundled/executable builds.
     */
    wsRoutes?: WebSocketRouteDefinition[];

    /**
     * Validation configuration: coercion, response-validation mode, and error
     * rendering.
     */
    validation?: ValidatorConfig;

    /**
     * OpenAPI configuration for production builds. When using pre-built
     * `apiRoutes`, the convention file cannot be discovered from the filesystem,
     * so the config must be passed here. In dev mode, `openapi.config.ts` is
     * auto-discovered and this field is ignored.
     */
    openapi?: OpenAPIConfig;

    /**
     * Pre-resolved global hooks module (e.g. from `src/hooks.ts`).
     * Only used in production builds (when `apiRoutes` is provided).
     * In dev mode, `src/hooks.ts` is auto-discovered and this field is ignored.
     */
    globalHooks?: Record<string, unknown>;

    /**
     * Pre-resolved plugins module (e.g. from `src/plugins.ts`).
     * Only used in production builds (when `apiRoutes` is provided).
     * In dev mode, `src/plugins.ts` is auto-discovered and this field is ignored.
     */
    pluginsModule?: Record<string, unknown>;

    /**
     * Pre-resolved providers module (e.g. from `src/providers.ts`).
     * Only used in production builds (when `apiRoutes` is provided).
     * In dev mode, `src/providers.ts` is auto-discovered and this field is ignored.
     */
    providersModule?: Record<string, unknown>;

    /**
     * Optional hostname to bind for `serve()`. Web-standard; forwarded to the
     * adapter.
     */
    hostname?: string;

    /**
     * Optional runtime adapter override (test/embed seam). Defaults to the Bun
     * adapter, loaded lazily on first `serve()` so non-Bun bundles never
     * import it.
     */
    adapter?: RuntimeAdapter;
}

/**
 * Represents what a hook can return to control the request flow:
 * - Response: Stop here, send this response back to the client
 * - Function(Response): Continue processing, but transform the final response after handler runs
 * - undefined: I'm done, continue to the next hook or handler
 */
export type BurgerNext =
    Response | ((response: Response) => Promise<Response>) | undefined;

/**
 * A request handler function that processes incoming HTTP requests.
 * @param ctx - The BurgerContext object containing request data and services.
 * @returns A Response object or a Promise that resolves to a Response object.
 */
export type RequestHandler = (
    ctx: BurgerContext
) => Promise<Response> | Response;

/**
 * A fetch handler function that can be used to handle a request.
 * This can be a function that returns a Promise of a Response,
 * or a function that returns a Response.
 *
 * `server` is an optional structural view of the running server (upgrade/stop)
 * — Web-Standard, never Bun-specific.
 */
export type FetchHandler = (
    request: Request,
    server?: ServerInfo
) => Promise<Response> | Response;

export interface RouteDefinition {
    /**
     * The path of the route.
     */
    path: string;
    /**
     * An object containing the request handlers for each HTTP method.
     * The keys are the HTTP method names (e.g. "GET", "POST", etc.);
     * only the methods in the {@link HTTPMethod} union are accepted —
     * anything else fails at compile time and would 405 at runtime.
     * The values are the request handlers for that method.
     */
    handlers: Partial<Record<HTTPMethod, RequestHandler>>;
    /**
     * Lifecycle hooks declared in `hooks.ts`. Carried raw from the
     * compiler and compiled into a frozen `HookPlan` by RouterCompiler. Mapped
     * onto the single pipeline: `beforeRoute` (global → route) runs before
     * the handler; `afterRoute` / `mapResponse` are response hooks.
     * `route.ts` contains handlers only — there is no
     * per-route `hooks` export.
     */
    hooks?: RouteHooks;

    /**
     * An optional route schema to validate the request data against.
     * This property is set by the user when defining a route.
     * The schema is used to validate the request data for each HTTP method.
     * The keys are the HTTP method names (in lowercase) and the values are
     * the Zod schema objects for that method.
     */
    schema?: RouteSchema;

    /**
     * Optional OpenAPI metadata to generate documentation for the route.
     * If provided, this property should define an object where each key
     * is an HTTP method name (in lowercase), and the value is an object
     * containing the OpenAPI metadata for that method.
     */
    openapi?: openapi;

    /**
     * Indicates if this route is a wildcard route.
     * True for routes using the `[...]` syntax.
     * This property is used internally to identify wildcard routes.
     */
    isWildcard?: boolean;

    /**
     * Route-specific configuration from `config.ts`. Available as `ctx.config`
     * at runtime. Used by hooks/plugins to read route-level settings (auth,
     * cache, timeout, responseValidation, …).
     */
    config?: Record<string, unknown>;
}

/**
 * The per-method body of a route schema. For each HTTP method you can
 * optionally define:
 * - params: for URL parameters,
 * - query: for query string parameters,
 * - headers / cookies / body: for the corresponding request data,
 * - response: per-status response schemas validated after the handler.
 */
export interface MethodSchema {
    params?: SchemaInput;
    query?: SchemaInput;
    headers?: SchemaInput;
    cookies?: SchemaInput;
    body?: SchemaInput;
    /** Per-route opt-in override for coercion. */
    coerce?: boolean;
    /** Per-status-code response schemas, validated after the handler. */
    response?: Record<string, SchemaInput>;
}

/**
 * Define a type for the route schema.
 *
 * Keys are HTTP method names; both lowercase (canonical, matching the
 * compiled form) and uppercase (accepted by the compiler for programmatic
 * routes) are legal at runtime, so both are accepted here. Anything else
 * fails at compile time.
 */
export type RouteSchema = Partial<
    Record<LowercaseHTTPMethod | HTTPMethod, MethodSchema>
>;

/**
 * Per-method OpenAPI metadata. Each key is an HTTP method name in lowercase
 * (the compiled form the OpenAPI generator reads); uppercase keys are a
 * silent no-op at runtime, so they are rejected at compile time.
 */
export interface OpenAPIMeta {
    summary?: string;
    description?: string;
    tags?: string[];
    operationId?: string;
    deprecated?: boolean;
    responses?: Record<string, Record<string, unknown>>;
    externalDocs?: {
        description?: string;
        url?: string;
    };
}

/**
 * Optional OpenAPI metadata to generate documentation for the route.
 * Keyed by lowercase HTTP method; see {@link OpenAPIMeta}.
 *
 * If the `openapi` property is not defined, the route will not be included in
 * the generated OpenAPI documentation.
 */
export type openapi = Partial<Record<LowercaseHTTPMethod, OpenAPIMeta>>;

/**
 * The shape of a `burger.build.ts` export — build-time settings read by the
 * CLI (dirs, prefixes, debug). The dir/prefix fields are always present in
 * a scaffolded file (convention defaults apply otherwise). Build-time only;
 * runtime options belong in `new Burger({...})` (`ServerOptions`).
 */
export interface BuildConfig {
    /** Directory with API route files (e.g. `./src/api`). */
    apiDir: string;
    /** Directory with HTML page files (e.g. `./src/pages`). */
    pageDir: string;
    /** URL prefix for API routes (default `/api`). */
    apiPrefix: string;
    /** URL prefix for page routes (default `/`). */
    pagePrefix: string;
    /** Directory with WebSocket route files (e.g. `./src/websocket`). */
    wsDir?: string;
    /** Extra logging when true. */
    debug?: boolean;
}

/**
 * Empty interface for module augmentation. Extend this to type the route's
 * `config.ts` options, so `ctx.config` is typed for hooks and plugins:
 *
 * ```ts
 * declare module "burger-api" {
 *     interface RouteConfig {
 *         auth: boolean;
 *         timeout: number;
 *     }
 * }
 * ```
 *
 * Without augmentation, `ctx.config` is typed as the empty `RouteConfig`,
 * so unknown keys fail at compile time. Augment to unlock them.
 */
export interface RouteConfig {}

export interface PageDefinition {
    path: string;
    handler: RequestHandler;
}

export interface TrieNode {
    children: Map<string, TrieNode>; // Static path segments, like "users"
    paramChild?: TrieNode; // Dynamic segments, like ":id"
    paramName?: string; // Name of dynamic parameter, like "id"
    wildcardChild?: TrieNode; // Wildcard segments, like "*"
    isWildcard?: boolean; // True for wildcard routes [...]
    route?: RouteDefinition; // Route definition at leaf node
}

// Re-export the public-facing context types so consumers can reference
// them from the package root (e.g. `RouteMeta`, `ContextSet`).
export type {
    ContextField,
    ContextInit,
    ContextSet,
    RouteAccessInfo,
    RouteMeta,
} from '../context/types';

// Re-export OpenAPI config types
export type {
    OpenAPIConfig,
    DocsProvider,
    OpenAPIObject,
    JsonSchemaConverter,
    DocsAuth,
    OpenAPIServer,
    OpenAPIContact,
    OpenAPILicense,
    OpenAPIExternalDocs,
} from './openapi-config';
