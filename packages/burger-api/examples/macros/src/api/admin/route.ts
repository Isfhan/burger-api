import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const user = (ctx.services as any).user;
    return Response.json({
        message: 'Admin panel',
        user: user?.name ?? 'unknown',
    });
}
