import type { BurgerRequest } from '@src';

export async function GET(req: BurgerRequest) {
    return Response.json({
        message: 'Users list',
        level: 'users',
    });
}
