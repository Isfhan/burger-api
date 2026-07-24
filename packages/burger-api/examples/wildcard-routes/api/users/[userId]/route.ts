import { z } from 'zod';
import type { BurgerContext } from '../../../../../src/index';

// Dummy users data
const users = [
    { id: 1, name: 'John Doe' },
    { id: 2, name: 'Jane Doe' },
    { id: 3, name: 'John Smith' },
    { id: 4, name: 'Jane Smith' },
];

/**
 * Zod schema for the dynamic route
 * Route: /api/users/[userId]
 *
 * Note: This schema will validate the request params
 */
export const schema = {
    get: {
        params: z.object({
            userId: z.string().min(1, 'User ID is required'),
        }),
    },
};

/**
 * Dynamic user details route example
 * Route: /api/users/[userId]
 *
 * Note: This route will handle the path (/api/users/[userId]) with the dynamic user id
 */
export async function GET(
    ctx: BurgerContext
) {
    const { userId } = (ctx.validated!.params as any);
    const user = users.find((user) => user.id === parseInt(userId)) || null;
    if (!user) {
        return Response.json(
            {
                message: 'User not found',
                user: null,
                note: 'This route handles the path (/api/users/[userId]) with the dynamic user id',
                level: 'dynamic route example',
            },
            { status: 404 }
        );
    }
    return Response.json({
        message: 'User found',
        user: user,
        note: 'This route handles the path (/api/users/[userId]) with the dynamic user id and returns the user details',
        level: 'dynamic route example',
    });
}
