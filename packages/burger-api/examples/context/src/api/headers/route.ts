import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const contentType = ctx.headers.get('content-type');
    const accept = ctx.headers.get('accept');
    const userAgent = ctx.headers.get('user-agent');
    return Response.json({
        message: 'Request headers',
        contentType,
        accept,
        userAgent,
    });
}
