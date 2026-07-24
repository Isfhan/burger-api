import type { BurgerContext } from '../../../src/index';

export const globalMiddleware1 = (
    ctx: BurgerContext
) => {
    console.log('Global middleware executed for request:', ctx.url);

    // Call the next middleware
    return undefined;
};
