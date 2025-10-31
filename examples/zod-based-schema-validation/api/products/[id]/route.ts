// Import stuff from zod
import { z } from 'zod';

// Import types
import type { BurgerNext, BurgerRequest, Middleware } from '../../../../../src/index';

// Export a schema for GET requests.
export const schema = {
    get: {
        params: z.object({
            id: z.string().min(1, 'ID is required'),
        }),
    },
};

// Route-specific middleware
export const middleware: Middleware[] = [
    (req: BurgerRequest): BurgerNext => {
        console.log(
            'Product Detail Route-specific middleware executed for request:',
            req.url
        );
        return undefined;
    },
];

export async function GET(
    req: BurgerRequest<{ params: z.infer<typeof schema.get.params> }>
) {
    return Response.json({
        id: req.validated?.params.id,
        name: 'John Doe',
    });
}
