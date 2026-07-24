import type { BurgerContext } from '../../../../src/index';

export function GET(ctx: BurgerContext) {
    const r = ctx as unknown as Record<string, unknown>;
    return Response.json({
        user: r.user,
        role: r.role,
        tenant: r.tenant,
    });
}
