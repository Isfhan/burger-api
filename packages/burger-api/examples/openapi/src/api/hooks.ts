import type { BurgerContext } from 'burger-api';

const globalLogger = (ctx: BurgerContext) => {
    console.log(`[Global Logger] ${ctx.method} ${ctx.url}`);
    return undefined;
};

export const beforeRoute = [globalLogger];
