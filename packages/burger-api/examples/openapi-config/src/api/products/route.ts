import type { BurgerContext } from 'burger-api';

const products = [
    { id: 1, name: 'Burger', price: 9.99 },
    { id: 2, name: 'Fries', price: 4.99 },
];

export async function GET(ctx: BurgerContext) {
    return Response.json({ products });
}

export async function POST(ctx: BurgerContext) {
    const body = await ctx.json();
    const product = { id: products.length + 1, ...body };
    products.push(product);
    return Response.json({ product }, { status: 201 });
}
