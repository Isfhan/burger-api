import type { BurgerContext } from '../../../src/index';

// Global middleware example: a simple logger.
export const globalLogger = (
    ctx: BurgerContext
) => {
    // console.log(`[Global Logger] ${ctx.method} ${ctx.url}`);
    let a = 2 + Math.random();
    // return new Response(a.toString());
    console.log(a);
    // console.log('Time:', Date.now());
    return undefined;
};
