import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const params = ctx.wildcardParams || [];
    return Response.json({
        message: 'Admin wildcard route',
        path: params.join('/'),
        segments: params.length,
    });
}
