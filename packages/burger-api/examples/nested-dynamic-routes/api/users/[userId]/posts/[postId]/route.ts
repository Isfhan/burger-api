import { z } from 'zod';
import type { BurgerContext } from '../../../../../../../src/index';

export const schema = {
    get: {
        params: z.object({
            userId: z.string().min(1, 'User ID is required'),
            postId: z.string().min(1, 'Post ID is required'),
        }),
    },
};

export async function GET(
    ctx: BurgerContext
) {
    const { userId, postId } = (ctx.validated!.params as any);
    return Response.json({
        message: 'Post details',
        userId,
        postId,
        level: 'post',
    });
}
