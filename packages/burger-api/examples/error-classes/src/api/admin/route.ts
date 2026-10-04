import type { BurgerContext } from 'burger-api';
import { UnauthorizedError, ForbiddenError } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const authHeader = ctx.headers.get('authorization');
    if (!authHeader) {
        throw new UnauthorizedError('Missing authorization header');
    }
    if (authHeader !== 'Bearer admin-token') {
        throw new ForbiddenError('Insufficient permissions');
    }
    return Response.json({ message: 'Welcome, admin!' });
}
