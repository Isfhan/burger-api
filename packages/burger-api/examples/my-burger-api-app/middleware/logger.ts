import type { Middleware, BurgerNext, BurgerRequest } from '../../../src/index';

// Global middleware example: a simple logger.
export const globalLogger: Middleware = (
    request: BurgerRequest
): BurgerNext => {
    // console.log(`[Global Logger] ${request.method} ${request.url}`);
    let a = 2 + Math.random();
    // return new Response(a.toString());
    console.log(a);
    // console.log('Time:', Date.now());
    return undefined;
};
