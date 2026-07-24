import type { BurgerRequest } from '../../../../../../src/index';

export function GET(req: BurgerRequest) {
    return Response.json({
        message: 'Product Detail',
    });
}
