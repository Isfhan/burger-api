import type { BurgerContext } from 'burger-api';
import type { POST as PostSchema } from './schema';

const items = [
    { id: 1, name: 'Burger', price: 9.99 },
    { id: 2, name: 'Fries', price: 3.99 },
    { id: 3, name: 'Shake', price: 5.99 },
];

export async function GET(ctx: BurgerContext) {
    // `query` is a model ref ("PaginationQuery") — inference falls back to
    // unknown; type it locally or use the `BurgerValidated` augmentation.
    const { page, limit } = ctx.validated?.query as {
        page: number;
        limit: number;
    };
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);

    return Response.json({
        items: paged,
        page,
        limit,
        total: items.length,
    });
}

export async function POST(ctx: BurgerContext<typeof PostSchema>) {
    const body: { name: string; price: number } | undefined =
        ctx.validated?.body;
    const item = { id: items.length + 1, ...body! };
    items.push(item);

    return Response.json(item, { status: 201 });
}
