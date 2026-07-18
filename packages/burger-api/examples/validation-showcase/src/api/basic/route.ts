import type { BurgerRequest } from 'burger-api';

// Backward-compat scenario (phase3 §17.1, §16.2): a route with NO schema
// behaves exactly as before — no validation, no `req.validated` shape change.
export function GET(_req: BurgerRequest) {
    return Response.json({ hello: 'world' });
}
