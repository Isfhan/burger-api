import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const params = ctx.wildcardParams || [];
    return Response.json({
        message: 'Auth wildcard route',
        path: params.join('/'),
        segments: params.length,
        note: 'No static sibling — handles /api/auth and all sub-paths',
    });
}
