import type { Middleware, BurgerNext, BurgerRequest } from '../../../src/index';

export const globalMiddleware1: Middleware = (
    request: BurgerRequest
): BurgerNext => {
    console.log('Global middleware executed for request:', request.url);

    // Call the next middleware
    return undefined;
};
