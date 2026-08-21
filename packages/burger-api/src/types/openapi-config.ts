/**
 * Configuration for OpenAPI document generation and docs UI.
 *
 * Exported from `openapi.config.ts` (auto-discovered convention file).
 * Lives next to the entry point: `src/openapi.config.ts` when `src/` exists,
 * or root `openapi.config.ts` for flat project structures.
 */

/**
 * A function that takes an OpenAPI document and returns HTML or a Response
 * for the documentation UI.
 *
 * Built-in providers: `scalarDocs()`, `swaggerDocs()`, `redocDocs()`.
 * Users can pass any custom function.
 */
export type DocsProvider = (spec: OpenAPIObject) => string | Response;

/**
 * Minimal OpenAPI 3.0 document shape used by the docs provider.
 * Full type not imported to avoid pulling in external dependencies.
 */
export interface OpenAPIObject {
    openapi: string;
    info: Record<string, unknown>;
    servers?: Array<{ url: string; description?: string }>;
    paths: Record<string, unknown>;
    components?: Record<string, unknown>;
    security?: Array<Record<string, string[]>>;
    tags?: Array<{ name: string; description?: string }>;
    externalDocs?: { url: string; description?: string };
    [key: string]: unknown;
}

/**
 * Converter function that takes a Standard Schema object and returns
 * a JSON Schema compatible with OpenAPI 3.0.
 *
 * Each validation library provides its own converter:
 * - Zod 4: `z.toJSONSchema`
 * - Valibot: custom converter
 * - ArkType: custom converter
 */
export type JsonSchemaConverter = (schema: unknown) => Record<string, unknown>;

/**
 * Basic auth credentials for protecting the `/docs` endpoint.
 */
export interface DocsAuth {
    username: string;
    password: string;
}

/**
 * OpenAPI server object (per OpenAPI 3.0 spec).
 */
export interface OpenAPIServer {
    url: string;
    description?: string;
}

/**
 * OpenAPI contact object (per OpenAPI 3.0 spec).
 */
export interface OpenAPIContact {
    name?: string;
    url?: string;
    email?: string;
}

/**
 * OpenAPI license object (per OpenAPI 3.0 spec).
 */
export interface OpenAPILicense {
    name: string;
    url?: string;
}

/**
 * OpenAPI external docs object (per OpenAPI 3.0 spec).
 */
export interface OpenAPIExternalDocs {
    url: string;
    description?: string;
}

/**
 * Configuration for the `openapi.config.ts` convention file.
 *
 * @example
 * ```ts
 * export default {
 * title: "My API",
 * description: "User management API",
 * version: "2.0.0",
 * servers: [{ url: "https://api.example.com" }],
 * contact: { name: "Team", email: "api@example.com" },
 * license: { name: "MIT" },
 * docsAuth: { username: "admin", password: process.env.DOCS_PASSWORD },
 * mapJsonSchema: { zod: z.toJSONSchema },
 * } satisfies OpenAPIConfig;
 * ```
 */
export interface OpenAPIConfig {
    // ── Document metadata (vision §16) ──

    /** API title. Defaults to "Burger API". */
    title?: string;

    /** API description. Defaults to "Burger API documentation". */
    description?: string;

    /** API version. Defaults to "1.0.0". */
    version?: string;

    /** Server URLs for the API. */
    servers?: OpenAPIServer[];

    /** API contact information. */
    contact?: OpenAPIContact;

    /** API license information. */
    license?: OpenAPILicense;

    /** URL to the API terms of service. */
    termsOfService?: string;

    /** Link to external documentation. */
    externalDocs?: OpenAPIExternalDocs;

    /**
     * Root security requirements. Defaults to `[]` ("no auth required") —
     * pass your schemes when the API uses authentication.
     */
    security?: Array<Record<string, string[]>>;

    // ── Endpoint config ──

    /** Path for the OpenAPI JSON spec endpoint. Defaults to "/openapi.json". */
    path?: string;

    /** Path for the documentation UI endpoint. Defaults to "/docs". */
    docsPath?: string;

    /** Whether OpenAPI endpoints are enabled. Defaults to true. */
    enabled?: boolean;

    // ── Docs protection ──

    /** Basic auth credentials for protecting the /docs endpoint. Omit for no protection. */
    docsAuth?: DocsAuth;

    // ── Docs UI ──

    /**
     * Documentation UI provider function.
     * Defaults to Swagger UI via CDN.
     * Built-in alternatives: `scalarDocs()`, `redocDocs()`.
     */
    provider?: DocsProvider;

    // ── Validator-agnostic schema conversion ──

    /**
     * Map of validator library names to their JSON Schema converter functions.
     * When a route schema is encountered, the framework looks up the converter
     * by the schema's library identifier and calls it to produce OpenAPI-compatible
     * JSON Schema.
     *
     * Zod 4 schemas with native `toJSONSchema()` are handled automatically.
     * This option is for other libraries (Valibot, ArkType, Effect Schema, etc.).
     *
     * @example
     * ```ts
     * mapJsonSchema: {
     * zod: z.toJSONSchema,
     * valibot: toJsonSchema,
     * }
     * ```
     */
    mapJsonSchema?: Record<string, JsonSchemaConverter>;
}
