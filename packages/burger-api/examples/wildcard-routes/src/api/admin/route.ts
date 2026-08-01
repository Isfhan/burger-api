import type { BurgerContext } from 'burger-api';

export async function GET(_ctx: BurgerContext) {
    return Response.json({
        message: 'Static admin route',
        note: 'Handles /api/admin — wildcard sibling handles sub-paths',
    });
}
