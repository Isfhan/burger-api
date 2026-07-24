import type { BurgerContext } from '../../../../../../src/index';

export function GET(ctx: BurgerContext) {
    const query = new URL(ctx.url).searchParams;

    return Response.json({
        id: ctx.params?.id,
        query: Object.fromEntries(query),
        name: 'John Doe',
    });
}
