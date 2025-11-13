import type { BurgerRequest } from '../../../../../src/index';

export async function GET(req: BurgerRequest) {
    console.log('[GET] Product Detail route invoked');

    return Response.json({
        name: 'Sample Product',
    });
}
