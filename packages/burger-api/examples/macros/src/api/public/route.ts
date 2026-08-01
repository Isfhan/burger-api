import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    return Response.json({
        message: 'Public endpoint with rate limiting',
        count: (ctx as any)._requestCount ?? 0,
    });
}
