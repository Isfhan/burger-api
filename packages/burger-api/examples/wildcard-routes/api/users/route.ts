import type {
    BurgerNext,
    BurgerRequest,
    Middleware,
} from '../../../../src/index';

export const middleware: Middleware[] = [
    (req: BurgerRequest): BurgerNext => {
        console.log('Route middleware executed');
        return undefined;
    },
];

/**
 * Static route example
 * Route: /api/users
 *
 * Note: This route will handle the base path (/api/users)
 */
export async function GET(req: BurgerRequest) {
    return Response.json({
        message: 'Users list route working',
        note: 'This route handles the base path (/api/users)',
        users: [
            { id: 1, name: 'John Doe' },
            { id: 2, name: 'Jane Doe' },
            { id: 3, name: 'John Smith' },
            { id: 4, name: 'Jane Smith' },
        ],
        level: 'static route example',
    });
}
