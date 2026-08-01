import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const { userId } = (ctx.validated!.params as any);
    const params = ctx.wildcardParams || [];
    return Response.json({
        message: 'User wildcard route',
        userId,
        path: params.join('/'),
        segments: params.length,
    });
}
