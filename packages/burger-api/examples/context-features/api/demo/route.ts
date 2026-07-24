import type { BurgerContext } from '../../../../src/index';

// Demonstrates the Phase 2 request context:
//   - `ctx.query`  (lazily parsed query record)
//   - `ctx.route`  (matched-route identity: { path, pattern })
//   - `ctx.set`    (response mutation surface)
export async function GET(ctx: BurgerContext) {
    return Response.json({
        route: ctx.route,
        query: ctx.query,
    });
}
