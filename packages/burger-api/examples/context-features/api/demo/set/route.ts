import type { BurgerContext } from '../../../../../src/index';

// Demonstrates `ctx.set` — the Phase 2 response-mutation surface.
// `applySet` merges `ctx.set.status` / `ctx.set.headers` into the final
// Response at the single pipeline exit.
export async function GET(ctx: BurgerContext) {
    ctx.set ??= {};
    ctx.set.status = 202;
    ctx.set.headers = { 'x-context-demo': 'set-works' };
    return Response.json({ ok: true });
}
