import type { BurgerRequest } from '../../../../src/index';

export function GET(req: BurgerRequest) {
    const r = req as unknown as Record<string, unknown>;
    return Response.json({
        user: r.user,
        role: r.role,
        tenant: r.tenant,
    });
}
