import type { BurgerContext } from 'burger-api';
import type { GET as GetSchema, POST as PostSchema } from './schema';

export async function GET(ctx: BurgerContext<typeof GetSchema>) {
    const query: { search: string } | undefined = ctx.validated?.query;
    return Response.json({
        query,
        name: 'John Doe',
    });
}

export async function POST(ctx: BurgerContext<typeof PostSchema>) {
    const body:
        | { name: string; price: number }
        | undefined = ctx.validated?.body;
    return Response.json(body);
}
