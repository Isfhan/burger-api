import type { BurgerContext } from 'burger-api';

export async function POST(ctx: BurgerContext) {
    console.log('[POST] Products route invoked');
    const body = ctx.validated?.body || (await ctx.json());
    return Response.json(body);
}
