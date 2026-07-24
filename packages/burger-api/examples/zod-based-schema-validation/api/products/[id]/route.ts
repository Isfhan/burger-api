// Import stuff from zod
import { z } from 'zod';

// Import types
import type { BurgerNext, BurgerContext } from '../../../../../src/index';

// Export a schema for GET requests.
export const schema = {
    get: {
        params: z.object({
            id: z.string().min(1, 'ID is required'),
        }),
    },
};

// Route-specific middleware
export const beforeRoute = [
    (ctx: BurgerContext): BurgerNext => {
        console.log(
            'Product Detail Route-specific middleware executed for request:',
            ctx.url
        );
        return undefined;
    },
];

export async function GET(
    ctx: BurgerContext
) {
    return Response.json({
        id: (ctx.validated!.params as any).id,
        name: 'John Doe',
    });
}
