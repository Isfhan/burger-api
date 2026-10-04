import type { BurgerContext } from 'burger-api';

export async function GET() {
    return Response.json({
        message: 'Hello World from GET route',
    });
}

export async function POST(ctx: BurgerContext) {
    const body = (ctx.validated!.body as any);
    return Response.json({
        message: 'Hello World from POST route',
        data: body,
    });
}
