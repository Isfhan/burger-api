import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    return Response.json({
        id: (ctx.validated!.params as any).id,
        name: 'John Doe',
    });
}
