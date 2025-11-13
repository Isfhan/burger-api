import type { BurgerNext, BurgerRequest, Middleware } from '../../../../../../src/index';

// Route-specific middleware
export const middleware: Middleware[] = [
    (req: BurgerRequest): BurgerNext => {
        console.log(
            'Profile Route-specific middleware executed for request:',
            req.url
        );
        return undefined;
    },
];

export function GET(req: BurgerRequest) {
    const query = new URL(req.url).searchParams;

    return Response.json({
        id: req.params?.id,
        query: Object.fromEntries(query),
        name: 'John Doe',
    });
}
