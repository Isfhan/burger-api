import type { BurgerRequest } from '@src';

/**
 * Admin wildcard route example
 * Route: /api/admin/[...]
 *
 * Note: This route will match any path that starts with /api/admin/
 */

export async function GET(req: BurgerRequest) {
    const wildcardParams = req.wildcardParams || [];
    return Response.json({
        message: 'Admin wildcard route working',
        wildcardParams: wildcardParams,
        adminPath: wildcardParams.join('/'),
        segments: wildcardParams.length,
        note: 'This demonstrates admin path handling with wildcard routes',
    });
}
