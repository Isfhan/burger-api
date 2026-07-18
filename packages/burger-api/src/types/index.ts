import type { BunRequest, Server } from 'bun';
import type { serve } from 'bun';
import type {
    ContextSet,
    RouteMeta,
} from '../context/types';
import type { SchemaInput, ValidatorConfig } from '../validation/types';

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
     * Global middleware to be executed before each request.
     */
    globalMiddleware?: Middleware[];

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
     * Seeded from `burger.config.ts` models by the CLI (phase3 §12.12, D10).
     */
    models?: Record<string, SchemaInput>;

    /**
     * Validation 2.0 configuration (Phase 3): coercion, response-validation
     * mode, and error rendering (phase3 §14.8).
     */
    validation?: ValidatorConfig;
}

type DefaultRequestProperties = {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    cookie?: Record<string, unknown>;
    body?: Record<string, unknown>;
};

export interface BurgerRequest<
    RequestValidatedProperties extends DefaultRequestProperties =
        DefaultRequestProperties,
> extends Omit<BunRequest<string>, 'params'> {
    /**
     * Contains URL parameters extracted from the request path.
     * This property is only present if the request path matches a route
     * with dynamic parameters.
     *
     * For example, if the route is `/users/:id`, and the request path is
     * `/users/123`, then the `params` property will be `{ id: '123' }`.
     */
    params?: Record<string, string>;

    /**
     * Contains validated data for the request.
     * This is an optional property that will only be present if
     * a middleware has validated the request data and attached the
     * validated data to the request.
     *
     * Properties:
     * - `params`: Validated URL parameters.
     * - `query`: Validated query string parameters.
     * - `body`: Validated request body (if JSON).
     */
    validated: RequestValidatedProperties;

    /**
     * Contains the wildcard parameters.
     * This is an optional property that will only be present if
     * the request path matches a route with a wildcard parameter.
     * For example, if the route is `/users/[...]`, and the request path is
     * `/users/123/456`, then the `wildcardParams` property will be `['123', '456']`.
     */
    wildcardParams?: string[];

    /**
     * The lazily parsed query string record.
     * Added in Phase 2 — optional and additive. Parsed on first access via the
     * fast Bun-native `parseQuery` parser (no `URL`/`URLSearchParams` allocation).
     */
    query?: Record<string, string | string[]>;

    /**
     * The response mutation object (`status` + `headers` only in Phase 2).
     * Added in Phase 2 — optional and additive. Merged into the response by
     * `applySet` at the pipeline exit. `cookies` is reserved for Phase 7.
     */
    set?: ContextSet;

    /**
     * The matched-route identity (`path` + `pattern`).
     * Added in Phase 2 — optional and additive. Present on every matched route.
     */
    route?: RouteMeta;
}

/**
 * Represents what a middleware can return to control the request flow:
 * - Response: Stop here, send this response back to the client
 * - Function(Response): Continue processing, but transform the final response after handler runs
 * - undefined: I'm done, continue to the next middleware or handler
 */
export type BurgerNext =
    | Response
    | ((response: Response) => Promise<Response>)
    | undefined;

/**
 * A middleware function that processes HTTP requests.
 *
 * What middleware can do:
 * - Check if the request is valid (auth, validation, etc.)
 * - Stop the request by returning a Response
 * - Let the request continue by returning undefined
 * - Transform the final response by returning a function
 *
 * @param request - The HTTP request with Burger framework enhancements
 * @returns One of three things:
 *          - Response: Stop here, send this response back
 *          - Function: Transform the final response after handler runs
 *          - undefined: Continue to the next middleware or handler
 */
export type Middleware =
    | ((request: BurgerRequest) => Promise<BurgerNext>)
    | ((request: BurgerRequest) => BurgerNext);

/**
 * A request handler function that processes incoming HTTP requests.
 * @param request - The BurgerRequest object containing request object.
 * @returns A Response object or a Promise that resolves to a Response object.
 */
export type RequestHandler = (
    request: BurgerRequest
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
     * An array of middleware functions to run before the request handler.
     * The middleware functions will be run in the order they are specified.
     */
    middleware?: Middleware[];

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
        cookie?: SchemaInput | string;
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
    middleware?: Middleware[];
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
