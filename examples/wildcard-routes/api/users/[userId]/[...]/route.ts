import type { BurgerRequest } from '@src';
import { z } from 'zod';

/**
 * Zod schema for the wildcard route inside dynamic route folder
 * Route: /api/users/[userId]/[...]
 *
 * Note: This schema will validate the request params
 */
export const schema = {
    get: {
        params: z.object({
            userId: z.string().min(1, 'User ID is required'),
        }),
    },
};

/**
 * Wildcard route inside dynamic route folder example
 *
 * Note: This route will handle the path (/api/users/[userId]/[...]) with the dynamic user id and the wildcard parameters
 */
export async function GET(
    req: BurgerRequest<{ params: z.infer<typeof schema.get.params> }>
) {
    const { userId } = req.validated.params;
    const wildcardParams = req.wildcardParams || [];
    return Response.json({
        message: 'Wildcard route example working',
        level: 'wildcard route inside dynamic route folder example',
        note: 'This route handles the path (/api/users/[userId]/[...]) with the dynamic user id and the wildcard parameters',
        userId: userId,
        wildcardParams: wildcardParams,
        userPath: `${userId}/${wildcardParams.join('/')}`,
        segments: wildcardParams.length,
    });
}
