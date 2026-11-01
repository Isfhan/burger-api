import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const cookies = ctx.cookies;
    return Response.json({
        message: 'Cookies parsed from request',
        cookies,
        hasSession: 'session_id' in cookies,
    });
}
