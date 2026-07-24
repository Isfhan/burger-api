// Import stuff from zod
import { z } from 'zod';

// Import types
import type { BurgerContext } from '../../../../src/index';

// OpenAPI Metadata
export const openapi = {
    get: {
        summary: 'Get a Test',
        description:
            'Gets a test message.',
        tags: ['Test'],
        operationId: 'getTest',
    },
    post: {
        summary: 'Create a Test',
        description:
            'Creates a new test message. Requires name and price in the request body.',
        tags: ['Test'],
        operationId: 'createTest',
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

// Create a type for the request body
type ReqBody = z.infer<typeof schema.post.body>;

export async function GET() {
    return Response.json({
        message: 'Hello World from GET route',
    });
}

// POST handler: creates a new product.
export async function POST(ctx: BurgerContext) {
    // Use validated body
    const body = (ctx.validated!.body as any);

    // Return response with the validated body.
    return Response.json({
        message: 'Hello World from POST route',
        data: body,
    });
}
