import type { BurgerContext } from 'burger-api';

// Backward-compat scenario (phase3 §17.1, §16.2): a route with NO schema
// behaves exactly as before — no validation, no `ctx.validated` shape change.
export function GET(_ctx: BurgerContext) {
    return Response.json({ hello: 'world' });
}
