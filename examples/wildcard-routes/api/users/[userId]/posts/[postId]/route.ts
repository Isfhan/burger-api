import type { BurgerRequest } from '../../../../../../../src/index';
import { z } from 'zod';

/**
 * Zod schema for the nested dynamic route and wildcard route sibling example
 * Route: /api/users/[userId]/posts/[postId]
 *
 * Note: This schema will validate the request params
 */
export const schema = {
    get: {
        params: z.object({
            userId: z.string().min(1, 'User ID is required'),
            postId: z.string().min(1, 'Post ID is required'),
        }),
    },
};

/**
 * Nested dynamic route and wildcard route sibling example
 * This route handles the path (/api/users/[userId]/posts/[postId]) with the dynamic user id and the dynamic post id
 * Note: This route will return the post details for the given user id and post id
 */
export async function GET(
    req: BurgerRequest<{ params: z.infer<typeof schema.get.params> }>
) {
    const { userId, postId } = req.validated.params;
    return Response.json({
        message:
            'Nested dynamic route and wildcard route sibling example working',
        note: 'This route handles the path (/api/users/[userId]/posts/[postId]) with the dynamic user id and the dynamic post id',
        userId: userId,
        postId: postId,
        level: 'nested dynamic route and wildcard route sibling example',
    });
}
