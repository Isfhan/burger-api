import type { Server } from 'bun';
import type { serve } from 'bun';
import type { BurgerContext } from '../context/context';
import type { SchemaInput, ValidatorConfig } from '../validation/types';
import type { RouteHooks, TransformMap } from '../lifecycle/types';
export type { RouteHooks, TransformMap } from '../lifecycle/types';
import type { OpenAPIConfig } from './openapi-config';

/** Options type for Bun.serve(); use this instead of deprecated ServeOptions. */
type BunServerOptions = Parameters<typeof serve>[0];
import { z } from 'zod';

export interface ServerOptions extends Omit<
    BunServerOptions,
    | 'fetch'
    | 'port'
    | 'reusePort'
    | 'ipv6Only'
    | 'unix'
    | 'error'
    | 'id'
    | 'development'
> {
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
     * Reusable named schemas ("models") referenced by string from any route's
     * `schema` (Phase 3). Resolved at compile time; fail-fast on missing refs.
     * Seeded from `burger.build.ts` models by the CLI (phase3 §12.12, D10).
     */
    models?: Record<string, SchemaInput>;

    /**
     * Validation 2.0 configuration (Phase 3): coercion, response-validation
     * mode, and error rendering (phase3 §14.8).
     */
    validation?: ValidatorConfig;

    /**
     * OpenAPI configuration for production builds. When using pre-built
     * `apiRoutes`, the convention file cannot be discovered from the filesystem,
     * so the config must be passed here. In dev mode, `openapi.config.ts` is
     * auto-discovered and this field is ignored.
     */
    openapi?: OpenAPIConfig;
}

/**
 * Represents what a hook can return to control the request flow:
 * - Response: Stop here, send this response back to the client
 * - Function(Response): Continue processing, but transform the final response after handler runs
 * - undefined: I'm done, continue to the next hook or handler
 */
export type BurgerNext =
    | Response
    | ((response: Response) => Promise<Response>)
    | undefined;

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
 */
export type FetchHandler = (
    request: Request,
    server?: Server<{}>
) => Promise<Response> | Response;

export interface RouteDefinition {
    /**
     * The path of the route.
     */
    path: string;
    /**
     * An object containing the request handlers for each HTTP method.
     * The keys are the HTTP method names (e.g. "GET", "POST", etc.).
     * The values are the request handlers for that method.
     */
    handlers: { [method: string]: RequestHandler };
    /**
     * Lifecycle hooks declared in `hooks.ts`. Carried raw from the
     * compiler and compiled into a frozen `HookPlan` by RouterCompiler. Mapped
     * onto the single pipeline: `beforeRoute` (global → route) runs before
     * the handler; `afterRoute` / `mapResponse` are response phases.
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
 * Define a type for the route schema.
 * For each HTTP method (in lowercase), you can optionally define:
 * - params: for URL parameters,
 * - query: for query string parameters,
 * - body: for the request body.
 */
export type RouteSchema = {
    [method: string]: {
        params?: SchemaInput | string;
        query?: SchemaInput | string;
        headers?: SchemaInput | string;
        cookies?: SchemaInput | string;
        body?: SchemaInput | string;
        /** Per-route opt-in override for coercion (phase3 §7, §11). */
        coerce?: boolean;
        /** Per-status-code response schemas, validated after the handler. */
        response?: Record<string, SchemaInput>;
    };
};

/**
 * Optional OpenAPI metadata to generate documentation for the route.
 * Each key is an HTTP method name (in lowercase) and the value is an object
 * containing the OpenAPI metadata for that method.
 *
 * If the `openapi` property is not defined, the route will not be included in
 * the generated OpenAPI documentation.
 *
 * See the OpenAPI specification for the possible properties and their
 * descriptions.
 */
export type openapi = {
    [method: string]: {
        summary?: string;
        description?: string;
        tags?: string[];
        operationId?: string;
        deprecated?: boolean;
        responses?: Record<string, any>;
        externalDocs?: {
            description?: string;
            url?: string;
        };
    };
};

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

// Re-export the public-facing Phase 2 context types so consumers can reference
// them from the package root (e.g. `RouteMeta`, `ContextSet`).
export type {
    ContextField,
    ContextInit,
    ContextSet,
    RouteAccessInfo,
    RouteMeta,
} from '../context/types';

// Re-export OpenAPI config types (Phase 5)
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
