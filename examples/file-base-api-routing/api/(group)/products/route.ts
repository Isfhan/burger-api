import type { BurgerRequest } from '../../../../../src/index';

export function GET(req: BurgerRequest) {
    const query = new URL(req.url).searchParams;
    return Response.json({
        query: Object.fromEntries(query),
        name: 'John Doe',
    });
}

export async function POST(req: BurgerRequest) {
    const body = await req.json();
    return Response.json(body);
}
