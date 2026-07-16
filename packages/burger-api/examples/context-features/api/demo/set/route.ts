import type { BurgerRequest } from '../../../../../src/index';

// Demonstrates `req.set` — the Phase 2 response-mutation surface.
// `applySet` merges `ctx.set.status` / `ctx.set.headers` into the final
// Response at the single pipeline exit.
export async function GET(req: BurgerRequest) {
    req.set ??= {};
    req.set.status = 202;
    req.set.headers = { 'x-context-demo': 'set-works' };
    return Response.json({ ok: true });
}
