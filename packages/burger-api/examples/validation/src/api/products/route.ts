import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    return Response.json({
        query: ctx.validated?.query,
        name: 'John Doe',
    });
}

export async function POST(ctx: BurgerContext) {
    const body = ctx.validated?.body;
    return Response.json(body);
}
