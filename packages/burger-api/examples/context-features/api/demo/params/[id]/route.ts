import type { BurgerRequest } from '../../../../../../src/index';

// Demonstrates `req.params` and `req.route` for a dynamic route.
export async function GET(req: BurgerRequest) {
    return Response.json({
        id: req.params!.id,
        route: req.route,
    });
}
