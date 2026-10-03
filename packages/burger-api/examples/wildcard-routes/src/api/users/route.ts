import type { BurgerContext } from 'burger-api';

export async function GET(_ctx: BurgerContext) {
    return Response.json({
        message: 'Users list',
        users: [
            { id: 1, name: 'John Doe' },
            { id: 2, name: 'Jane Doe' },
        ],
    });
}
