// Import stuff from zod
import { z } from 'zod';

// Import types
import type { BurgerRequest, BurgerNext, Middleware } from '../../../../../src/index';

// OpenAPI Metadata
// Developers can provide custom metadata to enrich the docs.
export const openapi = {
    get: {
        summary: 'Get Product Details',
        description:
            'Retrieves the details of a product by its ID. Optionally accepts a search parameter.',
        tags: ['Product'],
        operationId: 'getProductDetails',
    },
};

// Validation Schemas
export const schema = {
    get: {
        // Validate URL parameters: convert "id" from string to number.
        params: z.object({
            id: z.preprocess((val) => {
                if (typeof val === 'string') {
                    const parsed = parseInt(val, 10);
                    return isNaN(parsed) ? 'string' : parsed;
                }
                return val;
            }, z.number().min(1, 'ID is required')),
        }),
        // Validate query parameters.
        query: z.object({
            search: z.string().optional(),
        }),
    },
};

// Route-Specific Middleware
export const middleware: Middleware[] = [
    (req: BurgerRequest): BurgerNext => {
        console.log('Product Detail Middleware');
        return undefined;
    },
];

export async function GET(
    req: BurgerRequest<{
        params: z.infer<typeof schema.get.params>;
        query: z.infer<typeof schema.get.query>;
    }>
) {
    console.log('[GET] Product Detail route invoked');

    const validatedParams = req.validated.params;
    const query = req.validated.query;

    return Response.json({
        id: validatedParams.id,
        query: query,
        name: 'Sample Product',
    });
}
