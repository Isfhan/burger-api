import type { BurgerContext } from '../../../../../src/index';

export function GET(ctx: BurgerContext) {
    const query = new URL(ctx.url).searchParams;
    return Response.json({
        query: Object.fromEntries(query),
        name: 'John Doe',
    });
}

export async function POST(ctx: BurgerContext) {
    const body = await ctx.json();
    return Response.json(body);
}
