import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const { userId, postId } = (ctx.validated!.params as any);
    return Response.json({ message: 'Post details', userId, postId });
}
