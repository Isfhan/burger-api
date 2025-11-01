import type { BurgerRequest } from '../../../../src/index';

export async function GET(req: BurgerRequest) {
    return Response.json({
        message: 'Users list',
        level: 'users',
    });
}
