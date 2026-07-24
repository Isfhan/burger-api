import type { BurgerContext } from '../../../src/index';

export async function GET() {
    // console.log('Hello world');
    return Response.json({ message: 'Hello world' });
    // return new Response('Hello world');
}
