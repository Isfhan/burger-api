import type { BurgerContext } from 'burger-api';

export async function GET(_ctx: BurgerContext) {
    return Response.json({
        message: 'Products list',
        products: [
            { id: 1, name: 'Burger' },
            { id: 2, name: 'Fries' },
        ],
    });
}

export async function POST(ctx: BurgerContext) {
    return Response.json({ message: 'Product created', body: ctx.validated?.body }, { status: 201 });
}
