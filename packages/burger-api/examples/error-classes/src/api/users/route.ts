import type { BurgerContext } from 'burger-api';

const users = [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' },
];

export async function GET(ctx: BurgerContext) {
    return Response.json({ users });
}
