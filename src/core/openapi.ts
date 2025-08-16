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
import type { ServerOptions, RouteDefinition } from '@burgerTypes';

/**
 * Maps a Zod type to an OpenAPI schema type.
 * @param zodType - The Zod type to map.
 * @returns The OpenAPI schema type.
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
    return 'string'; // fallback
}

/**
 * Builds an array of OpenAPI 3.0 parameters based on the Zod schema.
 * For each property in the Zod schema, an OpenAPI parameter is constructed
 * with the same name and required flag. The schema of the parameter is set
 * to a string type.
 * @param zodSchema - The Zod schema to construct parameters from. Can be undefined.
 * @param location - The location of the parameter. Must be either "path" or "query".
 * @returns An array of OpenAPI 3.0 parameter objects or an empty array if the Zod schema is undefined.
 */
function buildParameters(
    zodSchema: ZodObject<any, any> | undefined,
    location: 'path' | 'query'
): any[] {
    const parameters: any[] = [];
    if (zodSchema && typeof zodSchema.shape === 'object') {
        // Get the shape of the Zod schema
        const shape: Record<
            string,
            ZodType<unknown, unknown>
        > = zodSchema.shape;

        for (const key in shape) {
            // Get the definition of the field
            const fieldDef = shape[key];

            // Determine if the field is optional
            const isOptional = fieldDef instanceof ZodOptional;

            // Map the Zod type to an OpenAPI schema type
            const type = mapZodTypeToOpenAPIType(fieldDef) as
                | 'string'
                | 'number'
                | 'boolean'
                | 'array'
                | 'object';

            parameters.push({
                // Set the name of the parameter
                name: key,
                // Type of the parameter path or query
                in: location,
                // Set the required flag
                required: !isOptional,
                // Set the schema type
                schema: { type },
                // Description of the parameter
                description: `${location} parameter ${key}`,
            });
        }
    }

    return parameters;
}

/**
 * Builds a request body object for OpenAPI based on a Zod schema.
 * Converts the Zod schema into JSON schema and constructs an OpenAPI
 * requestBody object with content type "application/json".
 * @param zodSchema - The Zod schema to convert into JSON schema.
 * @returns An OpenAPI requestBody object, or undefined if no schema is provided.
 */
function buildRequestBody(zodSchema: any): any {
    // If no schema is provided, return undefined
    if (!zodSchema) return undefined;
    // Convert the Zod schema to a JSON schema
    const jsonSchema = toJSONSchema(zodSchema);
    // Return the OpenAPI requestBody object
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
 * Converts a route path from colon-based dynamic segments to OpenAPI's curly brace syntax.
 *
 * @param routePath The original route path with colon-based dynamic segments (e.g., "/user/:id").
 * @returns The converted route path with curly brace syntax (e.g., "/user/{id}").
 */
function convertPathForOpenAPI(routePath: string): string {
    // Replace occurrences of :param with {param}
    return routePath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
}

export function generateOpenAPIDocument(
    apiRoutes: RouteDefinition[],
    options: ServerOptions
) {
    const openapiDoc = {
        openapi: '3.0.0',
        info: {
            title: options.title || 'Burger API',
            description: options.description || 'Burger API documentation',
            version: options.version || '1.0.0',
        },
        paths: {} as Record<string, any>,
    };

    // Iterate over each route
    for (const route of apiRoutes) {
        // Convert colon-based dynamic segments to OpenAPI's {param} syntax
        const openApiPath = convertPathForOpenAPI(route.path);

        // Initialize path object if necessary
        openapiDoc.paths[openApiPath] = openapiDoc.paths[openApiPath] || {};

        // For each HTTP method in the route, add an OpenAPI operation.
        for (const method in route.handlers) {
            // Convert HTTP method to lowercase
            const lowerMethod = method.toLowerCase();

            // Use provided openapi metadata if available; else, fallback to auto-generated values.
            const methodMeta = route.openapi?.[lowerMethod] || {};

            // Generate an operationId: e.g., "get_api_product"
            const operationId =
                methodMeta.operationId ||
                `${lowerMethod}_${route.path.replace(/[\/:]/g, '_')}`;

            // Build parameters for both path and query from the schema.
            let parameters: any[] = [];
            if (route.schema && route.schema[lowerMethod]) {
                const schemaDef = route.schema[lowerMethod];
                parameters = [
                    ...buildParameters(schemaDef.params, 'path'),
                    ...buildParameters(schemaDef.query, 'query'),
                ];
            }

            // Build requestBody if a body schema exists.
            let requestBody = undefined;
            if (route.schema && route.schema[lowerMethod]?.body) {
                requestBody = buildRequestBody(route.schema[lowerMethod].body);
            }

            openapiDoc.paths[openApiPath][lowerMethod] = {
                operationId,
                summary:
                    methodMeta.summary || `Summary for ${method} ${route.path}`,
                description: methodMeta.description || '',
                tags: methodMeta.tags || [],
                deprecated: methodMeta.deprecated || false,
                parameters: parameters,
                requestBody: requestBody,
                responses: methodMeta.responses || {
                    '200': {
                        description: 'Successful response',
                    },
                },
                externalDocs: methodMeta.externalDocs || undefined,
            };
        }
    }

    return openapiDoc;
}
