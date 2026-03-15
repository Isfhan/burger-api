import type { z } from 'zod';
import type {
    RouteSchema,
    Middleware,
    BurgerRequest,
    BurgerNext,
} from '../types/index';

/**
 * createValidationMiddleware:
 * - Precompute a smaller runtime descriptor per method to avoid
 *   repeatedly touching the full schema object on every request.
 * - Uses safeParse (sync) for Zod schemas (no try/catch around safeParse).
 * - Parses querystring manually (no URL constructor, no throw).
 * - Lazily allocates the errors container only when needed.
 * - Avoids unnecessary object allocations for successful paths.
 *
 * @param schema - The route schema to validate the request against.
 * @returns The middleware function that validates the request.
 */
export function createValidationMiddleware(schema: RouteSchema): Middleware {
    // Precompute a minimal descriptor per HTTP method (lowercased)
    // This work runs once at middleware creation time (fast startup cost, zero cost on each request for those computations).
    const methodMap: Record<
        string,
        {
            paramsSchema?: z.ZodTypeAny;
            querySchema?: z.ZodTypeAny;
            bodySchema?: z.ZodTypeAny;
            hasParams: boolean;
            hasQuery: boolean;
            hasBody: boolean;
        }
    > = {};

    // Loop through the schema and create a method map
    for (const rawMethod of Object.keys(schema)) {
        // Convert the method to lowercase
        const key = rawMethod.toLowerCase();

        // Get the method schema
        const m = schema[rawMethod] || {};

        // Create a method map
        methodMap[key] = {
            paramsSchema: m.params, // URL parameters schema
            querySchema: m.query, // Query parameters schema
            bodySchema: m.body, // Request body schema
            hasParams: !!m.params, // Whether the method has URL parameters
            hasQuery: !!m.query, // Whether the method has query parameters
            hasBody: !!m.body, // Whether the method has a request body
        };
    }

    /**
     * The middleware function that validates the request.
     *
     * @param req - The request object.
     * @returns The next middleware or handler.
     */
    return async (req: BurgerRequest): Promise<BurgerNext> => {
        // If the request has been validated, continue.
        if (req.validated) {
            return undefined; // Proceed to the next middleware or handler
        }

        // Determine the HTTP method (in lowercase) to match the schema.
        const method = (req.method || 'get').toLowerCase();

        // Get the schema for the current method.
        const methodSchema = methodMap[method];

        // If there's no schema for this method, continue.
        if (!methodSchema) {
            return undefined; // Proceed to the next middleware or handler
        }

        // Get the schemas for the current method.
        const {
            paramsSchema,
            querySchema,
            bodySchema,
            hasParams,
            hasQuery,
            hasBody,
        } = methodSchema;

        /**
         * Object to store validated request data. This will be attached to the
         * request object if validation is successful. The object will contain
         * validated data for the following fields:
         *
         * - `params`: Validated URL parameters (if available and schema provided).
         * - `query`: Validated query parameters (if available and schema provided).
         * - `body`: Validated request body (if JSON and schema provided).
         */
        const validated: BurgerRequest['validated'] = {};

        // Lazy errors — create only if/when an error occurs
        let errors: {
            params?: unknown;
            query?: unknown;
            body?: unknown;
        } | null = null;

        // Validate URL parameters (if available and schema provided).
        if (hasParams && req.params && paramsSchema) {
            const result = paramsSchema.safeParse(req.params);
            if (result.success) {
                validated.params = result.data as Record<string, unknown>;
            } else {
                if (!errors) errors = {};
                errors.params = result.error.issues;
            }
        }

        // Validate query parameters if available and schema provided.
        if (hasQuery && querySchema) {
            const url = new URL(req.url);
            const queryParams = Object.fromEntries(url.searchParams.entries());

            const result = querySchema.safeParse(queryParams);
            if (result.success) {
                validated.query = result.data as Record<string, unknown>;
            } else {
                if (!errors) errors = {};
                errors.query = result.error.issues;
            }
        }

        // Get the content type header
        const contentType =
            req.headers.get('content-type') ??
            req.headers.get('Content-Type') ??
            '';

        // Validate request body if it's JSON
        if (
            hasBody &&
            contentType?.includes('application/json') &&
            bodySchema
        ) {
            try {
                // Attempt to parse the JSON body.
                const bodyData = await req.json();
                const result = bodySchema.safeParse(bodyData);
                if (result.success) {
                    // Set the validated body.
                    validated.body = result.data as Record<string, unknown>;

                    // Set the json method to return the validated body.
                    req.json = async () => result.data;
                } else {
                    if (!errors) errors = {};
                    errors.body = result.error.issues;
                }
            } catch (error: unknown) {
                // Create a message from the error.
                const msg =
                    error instanceof Error ? error.message : String(error);

                if (!errors) errors = {};
                errors.body = [{ message: msg }];
            }
        }

        if (errors) {
            // If validation fails, return a 400 response with error details.
            return Response.json({ errors }, { status: 400 });
        }

        // Attach validated data to the request.
        req.validated = validated;

        // Continue to the next middleware or handler.
        return undefined; // Proceed
    };
}
