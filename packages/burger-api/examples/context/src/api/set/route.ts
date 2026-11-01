import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    ctx.set.status = 200;
    ctx.set.headers = {
        'X-Custom-Header': 'hello',
        'X-Request-Time': Date.now().toString(),
    };
    return Response.json({
        message: 'Response with custom status and headers via ctx.set',
    });
}
