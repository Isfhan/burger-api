import type { BurgerContext } from 'burger-api';

export async function GET(_ctx: BurgerContext) {
    return Response.json({ message: 'Users list', level: 'users' });
}
