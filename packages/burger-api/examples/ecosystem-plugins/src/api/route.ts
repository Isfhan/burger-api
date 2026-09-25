import type { BurgerContext } from 'burger-api';

export function GET(ctx: BurgerContext) {
    return Response.json({
        message: 'Ecosystem plugins are active',
        plugins: ['api-key'],
    });
}
