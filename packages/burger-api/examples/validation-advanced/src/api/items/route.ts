import type { BurgerContext } from 'burger-api';
import type { GET as GetSchema, POST as PostSchema } from './schema';

const items = [
    { id: 1, name: 'Burger', price: 9.99 },
    { id: 2, name: 'Fries', price: 3.99 },
    { id: 3, name: 'Shake', price: 5.99 },
];

export async function GET(ctx: BurgerContext<typeof GetSchema>) {
    // `query` comes from the shared PaginationQuery schema — fully typed.
    const { page, limit } = ctx.validated.query;
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
    // body is validated before the handler runs (422 otherwise), so the
    // non-null assertion is safe here — the slot stays optional in the type
    // because validation only runs for JSON requests.
    const item = { id: items.length + 1, ...ctx.validated.body! };
    items.push(item);

    return Response.json(item, { status: 201 });
}
