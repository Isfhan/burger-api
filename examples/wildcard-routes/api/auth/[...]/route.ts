import type { BurgerRequest } from '../../../../../src/index';

/**
 * Documentation wildcard route (no static sibling)
 * Route: /api/auth/[...]
 *
 * This demonstrates wildcard handling base path when no static route exists.
 * Unlike /api/admin which has a static sibling, this route handles both:
 * - /api/auth (base path with empty params)
 * - /api/auth/login (with segments)
 * - /api/auth/logout (with segments)
 * - /api/auth/register (with segments)
 * - /api/auth/forgot-password (with segments)
 * - /api/auth/reset-password (with segments)
 * - /api/auth/verify-email (with segments)
 */

export async function GET(req: BurgerRequest) {
    const wildcardParams = req.wildcardParams || [];
    return Response.json({
        message: 'Auth wildcard route',
        wildcardParams: wildcardParams,
        authPath: wildcardParams.join('/'),
        segments: wildcardParams.length,
        note: 'This route handles base path (/api/auth) with wildcard parameters if provided since no static route exists as a sibling',
    });
}
