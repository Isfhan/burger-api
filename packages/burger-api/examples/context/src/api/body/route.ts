import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    return Response.json({
        message: 'POST with JSON body to test body parsing',
    });
}

export async function POST(ctx: BurgerContext) {
    const body = await ctx.json();
    return Response.json({
        message: 'Body parsed via ctx.json()',
        body,
        method: ctx.method,
        url: ctx.url,
    });
}
