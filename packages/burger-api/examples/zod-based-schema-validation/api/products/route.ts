// Import stuff from zod
import { z } from 'zod';

// Import types
import type { BurgerNext, BurgerContext } from '../../../../src/index';

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
export const beforeRoute = [
    (ctx: BurgerContext): BurgerNext => {
        console.log(
            'Product Route-specific middleware executed for request:',
            ctx.url
        );
        return undefined;
    },
];

// GET handler: uses validated query if available.
export async function GET(
    ctx: BurgerContext
) {
    // Get the validated query by zod schema.
    // const query = new URL(req.url).searchParams;

    // Return response with the validated query.
    return Response.json({
        query: ctx.validated?.query,
        name: 'John Doe',
    });
}

// POST handler: uses validated body if available.
export async function POST(
    ctx: BurgerContext
) {
    // Get the validated body by zod schema.
    const body = ctx.validated?.body;

    // Return response with the validated body.
    return Response.json(body);
}
