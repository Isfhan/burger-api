import type { BurgerContext } from 'burger-api';

// Global hook example: a simple logger.
const globalLogger = (ctx: BurgerContext) => {
    console.log(`[Global Logger] ${ctx.method} ${ctx.url}`);
    return undefined; // Continue to the next hook
};

export const beforeRoute = [globalLogger];
