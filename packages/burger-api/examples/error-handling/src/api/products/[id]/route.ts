import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    console.log('[GET] Dynamic Product route invoked');
    const validatedParams = (ctx.validated!.params as any);
    const query = (ctx.validated!.query as any);
    return Response.json({
        id: validatedParams?.id,
        query: query,
        name: 'Sample Product',
    });
}
