import { z } from 'zod';
import type { BurgerRequest } from '../../../../../../../src/index';

export const schema = {
    get: {
        params: z.object({
            userId: z.string().min(1, 'User ID is required'),
            postId: z.string().min(1, 'Post ID is required'),
        }),
    },
};

export async function GET(
    req: BurgerRequest<{ params: z.infer<typeof schema.get.params> }>
) {
    const { userId, postId } = req.validated.params;
    return Response.json({
        message: 'Post details',
        userId,
        postId,
        level: 'post',
    });
}
