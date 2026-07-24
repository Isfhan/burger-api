// Import stuff from zod
import { z } from 'zod';

// Import types
import type { BurgerContext, BurgerNext } from '../../../../../src/index';

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
export const beforeRoute = [
    (ctx: BurgerContext): BurgerNext => {
        console.log('Product Detail Middleware');
        return undefined;
    },
];

export async function GET(
    ctx: BurgerContext
) {
    console.log('[GET] Dynamic Product route invoked');

    // Use validated parameters
    const validatedParams = (ctx.validated!.params as any);
    const query = (ctx.validated!.query as any);

    return Response.json({
        id: validatedParams.id,
        query: query,
        name: 'Sample Product',
    });
}
