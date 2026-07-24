import type { BurgerContext } from '../../../../src/index';

export async function GET(ctx: BurgerContext) {
    return Response.json({
        message: 'Users list',
        level: 'users',
    });
}
