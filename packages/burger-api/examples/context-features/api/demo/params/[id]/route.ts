import type { BurgerContext } from '../../../../../../src/index';

// Demonstrates `ctx.params` and `ctx.route` for a dynamic route.
export async function GET(ctx: BurgerContext) {
    return Response.json({
        id: ctx.params!.id,
        route: ctx.route,
    });
}
