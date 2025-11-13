// Import stuff from zod
import { z } from 'zod';

// Import types
import type { BurgerRequest, BurgerNext, Middleware } from '../../../../src/index';

// OpenAPI Metadata
// Developers can provide custom metadata to enrich the docs.
export const openapi = {
    post: {
        summary: 'Create a Product',
        description:
            'Creates a new product. Requires name and price in the request body.',
        tags: ['Product'],
        operationId: 'createProduct',
    },
};

// Validation Schemas
export const schema = {
    post: {
        // Validate the JSON body.
        body: z.object({
            name: z.string().min(1, 'Name is required'),
            price: z.number().positive('Price must be positive'),
        }),
    },
};

// Route-Specific Middleware
export const middleware: Middleware[] = [
    (req: BurgerRequest): BurgerNext => {
        console.log('Products Middleware');
        return undefined;
    },
];

// POST handler: creates a new product.
export async function POST(
    req: BurgerRequest<{ body: z.infer<typeof schema.post.body> }>
) {
    console.log('[POST] Products route invoked');
    // Use validated body
    const body = req.validated.body;
    return Response.json(body);
}
