import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const { userId } = (ctx.validated!.params as any);
    return Response.json({ message: 'User details', userId });
}
