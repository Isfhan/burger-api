import type { BurgerContext } from '../../../src/index';

// Global middleware example: a simple logger.
export const globalLogger = (ctx: BurgerContext) => {
    console.log(`[Global Logger] ${ctx.method} ${ctx.url}`);
    return undefined; // Continue to the next middleware
};
