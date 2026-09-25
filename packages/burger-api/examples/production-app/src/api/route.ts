import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    return Response.json({ message: 'Hello world' });
}
