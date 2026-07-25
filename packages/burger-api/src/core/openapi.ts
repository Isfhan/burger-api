// Import stuff from Zod 4.x
import {
    toJSONSchema,
    ZodArray,
    ZodBoolean,
    ZodNumber,
    ZodObject,
    ZodOptional,
    ZodString,
    ZodType,
} from 'zod';

// Import types
import type {
    ServerOptions,
    RouteDefinition,
    OpenAPIConfig,
    OpenAPIObject,
    JsonSchemaConverter,
} from '../types/index';
import type { SchemaInput } from '../validation/types';

/**
 * Maps a Zod type to an OpenAPI schema type.
 */
function mapZodTypeToOpenAPIType(zodType: ZodType<unknown, unknown>): string {
    if (zodType instanceof ZodOptional) {
        return mapZodTypeToOpenAPIType(
            zodType.unwrap() as ZodType<unknown, unknown>
        );
    }
    if (zodType instanceof ZodString) return 'string';
    if (zodType instanceof ZodNumber) return 'number';
    if (zodType instanceof ZodBoolean) return 'boolean';
    if (zodType instanceof ZodArray) return 'array';
    if (zodType instanceof ZodObject) return 'object';
    return 'string';
}

/**
 * Builds an array of OpenAPI 3.0 parameters from a Zod schema.
 */
function buildParameters(
    zodSchema: unknown,
    location: 'path' | 'query' | 'header' | 'cookie'
): any[] {
    const parameters: any[] = [];
    if (isZodObjectSchema(zodSchema)) {
        const shape: Record<string, ZodType<unknown, unknown>> =
            zodSchema.shape;

        for (const key in shape) {
            const fieldDef = shape[key];
            const isOptional = fieldDef instanceof ZodOptional;
            const type = mapZodTypeToOpenAPIType(fieldDef) as
                | 'string'
                | 'number'
                | 'boolean'
                | 'array'
                | 'object';

            parameters.push({
                name: key,
                in: location,
                required: !isOptional,
                schema: { type },
                description: `${location} parameter ${key}`,
            });
        }
    }

    return parameters;
}

function isZodObjectSchema(value: unknown): value is ZodObject<any, any> {
    return value instanceof ZodObject;
}

/**
 * Converts a SchemaInput to JSON Schema for OpenAPI.
 * Uses the configured converter when available, falls back to Zod's toJSONSchema.
 */
function schemaToJsonSchema(
    schema: SchemaInput,
    mapJsonSchema?: Record<string, JsonSchemaConverter>
): Record<string, unknown> | undefined {
    if (schema instanceof ZodType) {
        return toJSONSchema(schema) as Record<string, unknown>;
    }
    // Standard Schema: try configured converters
    if (mapJsonSchema && typeof schema === 'object' && schema !== null) {
        const stdSchema = schema as unknown as Record<string, unknown>;
        const vendor =
            (stdSchema['~standard'] as Record<string, unknown>)?.vendor ??
            stdSchema.__vendor;
        if (typeof vendor === 'string' && mapJsonSchema[vendor]) {
            return mapJsonSchema[vendor](schema);
        }
    }
    return undefined;
}

/**
 * Builds a request body object for OpenAPI based on a SchemaInput.
 */
function buildRequestBody(
    zodSchema: unknown,
    mapJsonSchema?: Record<string, JsonSchemaConverter>
): any {
    if (!(zodSchema instanceof ZodType) && !isStandardSchema(zodSchema))
        return undefined;
    const jsonSchema = schemaToJsonSchema(
        zodSchema as SchemaInput,
        mapJsonSchema
    );
    if (!jsonSchema) return undefined;
    return {
        content: {
            'application/json': {
                schema: jsonSchema,
            },
        },
        description: 'Request body',
        required: true,
    };
}

/**
 * Type guard for Standard Schema objects (has ~standard property).
 */
function isStandardSchema(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        '~standard' in value
    );
}

/**
 * Builds response objects from a route's response schema.
 * Converts each status code's schema to JSON Schema.
 */
function buildResponses(
    responseSchema: Record<string, SchemaInput> | undefined,
    openapiMetaResponses: Record<string, any> | undefined,
    mapJsonSchema?: Record<string, JsonSchemaConverter>
): Record<string, any> {
    // If the user provided explicit responses in openapi.ts, use those
    if (openapiMetaResponses) return openapiMetaResponses;

    // Auto-generate from schema.response
    if (responseSchema) {
        const responses: Record<string, any> = {};
        for (const [statusCode, schema] of Object.entries(responseSchema)) {
            const jsonSchema = schemaToJsonSchema(schema, mapJsonSchema);
            responses[statusCode] = {
                description:
                    statusCode.startsWith('2')
                        ? 'Successful response'
                        : statusCode.startsWith('4')
                          ? 'Client error'
                          : statusCode.startsWith('5')
                            ? 'Server error'
                            : `Response ${statusCode}`,
                content: jsonSchema
                    ? {
                          'application/json': {
                              schema: jsonSchema,
                          },
                      }
                    : undefined,
            };
        }
        return responses;
    }

    return { '200': { description: 'Successful response' } };
}

/**
 * Converts a route path from colon-based dynamic segments to OpenAPI's
 * curly brace syntax.
 */
function convertPathForOpenAPI(routePath: string): string {
    if (routePath.indexOf(':') === -1 && routePath.indexOf('*') === -1) {
        return routePath;
    }
    let converted = routePath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
    return converted;
}

/**
 * Generates a full OpenAPI 3.0 document from API routes.
 *
 * @param apiRoutes  Compiled route definitions.
 * @param options    Server options (fallback metadata source).
 * @param config     OpenAPI config from `openapi.config.ts` (primary metadata source).
 */
export function generateOpenAPIDocument(
    apiRoutes: RouteDefinition[],
    options: ServerOptions,
    config?: OpenAPIConfig
): OpenAPIObject {
    // Build info block: config overrides ServerOptions
    const info: Record<string, any> = {
        title: config?.title || options.title || 'Burger API',
        description:
            config?.description ||
            options.description ||
            'Burger API documentation',
        version: config?.version || options.version || '1.0.0',
    };
    if (config?.contact) info.contact = config.contact;
    if (config?.license) info.license = config.license;
    if (config?.termsOfService) info.termsOfService = config.termsOfService;

    const doc: OpenAPIObject = {
        openapi: '3.0.0',
        info,
        paths: {} as Record<string, any>,
    };

    // Servers
    if (config?.servers && config.servers.length > 0) {
        doc.servers = config.servers;
    }

    // External docs
    if (config?.externalDocs) {
        doc.externalDocs = config.externalDocs;
    }

    // Collect tags used across operations
    const tagSet = new Set<string>();

    // Iterate over each route
    for (const route of apiRoutes) {
        const openApiPath = convertPathForOpenAPI(route.path);
        doc.paths[openApiPath] = doc.paths[openApiPath] || {};

        for (const method in route.handlers) {
            if (typeof route.handlers[method] !== 'function') continue;
            const lowerMethod = method.toLowerCase();

            const methodMeta = route.openapi?.[lowerMethod] || {};

            const operationId =
                methodMeta.operationId ||
                `${lowerMethod}_${route.path.replace(/[\/:]/g, '_')}`;

            let parameters: any[] = [];
            if (route.schema && route.schema[lowerMethod]) {
                const schemaDef = route.schema[lowerMethod];
                parameters = [
                    ...buildParameters(schemaDef.params, 'path'),
                    ...buildParameters(schemaDef.query, 'query'),
                    ...buildParameters(schemaDef.headers, 'header'),
                    ...buildParameters(schemaDef.cookie, 'cookie'),
                ];
            }

            let requestBody = undefined;
            if (route.schema && route.schema[lowerMethod]?.body) {
                requestBody = buildRequestBody(
                    route.schema[lowerMethod].body,
                    config?.mapJsonSchema
                );
            }

            // Auto-generate response schemas from schema.response
            const responses = buildResponses(
                route.schema?.[lowerMethod]?.response as
                    | Record<string, SchemaInput>
                    | undefined,
                methodMeta.responses,
                config?.mapJsonSchema
            );

            // Collect tags
            const tags = methodMeta.tags || [];
            for (const tag of tags) {
                tagSet.add(tag);
            }

            (doc.paths[openApiPath] as any)[lowerMethod] = {
                operationId,
                summary:
                    methodMeta.summary ||
                    `Summary for ${method} ${route.path}`,
                description: methodMeta.description || '',
                tags,
                deprecated: methodMeta.deprecated || false,
                parameters,
                requestBody,
                responses,
                externalDocs: methodMeta.externalDocs || undefined,
            };
        }
    }

    // Emit top-level tags array from collected tags
    if (tagSet.size > 0) {
        (doc as any).tags = Array.from(tagSet).map((name) => ({ name }));
    }

    // Add components.schemas.ProblemDetail (RFC 9457) when any route
    // has auto-generated error responses or the doc has paths at all.
    if (Object.keys(doc.paths).length > 0) {
        (doc as any).components = {
            schemas: {
                ProblemDetail: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', description: 'URI reference identifying the problem type' },
                        title: { type: 'string', description: 'Short human-readable summary' },
                        status: { type: 'integer', description: 'HTTP status code' },
                        detail: { type: 'string', description: 'Human-readable explanation' },
                    },
                    required: ['type', 'title', 'status'],
                },
            },
        };
    }

    return doc;
}
