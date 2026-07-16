import type { BurgerRequest } from '../../../../src/index';

// Demonstrates the Phase 2 request context:
//   - `req.query`  (lazily parsed query record)
//   - `req.route`  (matched-route identity: { path, pattern })
//   - `req.set`    (response mutation surface)
export async function GET(req: BurgerRequest) {
    return Response.json({
        route: req.route,
        query: req.query,
    });
}
