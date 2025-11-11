// Import stuff from zod
import { z } from 'zod';

// Import types
import type { BurgerNext, BurgerRequest, Middleware } from '../../../../src/index';

// Export a schema for both GET and POST requests.
// For GET, we validate the query parameters.
// For POST, we validate the body.
export const schema = {
    get: {
        query: z.object({
            search: z.string(),
        }),
    },
    post: {
        body: z.object({
            // "name" is required and must be at least 1 character.
            name: z.string().min(1, 'Name is required'),
            // "price" must be a positive number.
            price: z.number().positive('Price must be positive'),
        }),
    },
};

// Route-specific middleware
export const middleware: Middleware[] = [
    (req: BurgerRequest): BurgerNext => {
        console.log(
            'Product Route-specific middleware executed for request:',
            req.url
        );
        return undefined;
    },
];

// GET handler: uses validated query if available.
export async function GET(
    req: BurgerRequest<{ query: z.infer<typeof schema.get.query> }>
) {
    // Get the validated query by zod schema.
    // const query = new URL(req.url).searchParams;

    // Return response with the validated query.
    return Response.json({
        query: req.validated?.query,
        name: 'John Doe',
    });
}

// POST handler: uses validated body if available.
export async function POST(
    req: BurgerRequest<{ body: z.infer<typeof schema.post.body> }>
) {
    // Get the validated body by zod schema.
    const body = req.validated?.body;

    // Return response with the validated body.
    return Response.json(body);
}
