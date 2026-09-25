import type { BurgerContext } from 'burger-api';
import { NotFoundError } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const id = Number(ctx.params?.id);
    const users = [
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob', role: 'user' },
    ];
    const user = users.find((u) => u.id === id);
    if (!user) {
        throw new NotFoundError(`User with id ${id} not found`);
    }
    return Response.json({ user });
}
