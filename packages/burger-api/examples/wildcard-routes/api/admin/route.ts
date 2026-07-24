import type { BurgerContext } from '../../../../src/index';

/**
 * Static admin route example
 * Route: /api/admin
 *
 * Note: This route will handle the base path (/api/admin) since a static route exists as a sibling
 */
export async function GET(ctx: BurgerContext) {
    return Response.json({
        message: 'Static admin route working',
        note: 'This route handles base path (/api/admin) since a static route exists as a sibling',
    });
}
