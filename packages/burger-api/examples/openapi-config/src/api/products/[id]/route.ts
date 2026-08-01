import type { BurgerContext } from 'burger-api';
import { NotFoundError } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const id = Number(ctx.params?.id);
    const products = [
        { id: 1, name: 'Burger', price: 9.99 },
        { id: 2, name: 'Fries', price: 4.99 },
    ];
    const product = products.find((p) => p.id === id);
    if (!product) throw new NotFoundError(`Product ${id} not found`);
    return Response.json({ product });
}
