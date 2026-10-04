import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const { id } = (ctx.validated!.params as any);
    return Response.json({ message: 'Profile', id });
}
