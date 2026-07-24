import type { BurgerContext } from '../../../../../../src/index';

export function GET(ctx: BurgerContext) {
    return Response.json({
        message: 'Product Detail',
    });
}
