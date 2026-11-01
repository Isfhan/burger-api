import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    console.log('[GET] Product Detail route invoked');

    return Response.json({
        name: 'Sample Product',
    });
}
