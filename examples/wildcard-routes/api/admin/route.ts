import type { BurgerRequest } from '@src';

/**
 * Static admin route example
 * Route: /api/admin
 *
 * Note: This route will handle the base path (/api/admin) since a static route exists as a sibling
 */
export async function GET(req: BurgerRequest) {
    return Response.json({
        message: 'Static admin route working',
        note: 'This route handles base path (/api/admin) since a static route exists as a sibling',
    });
}
