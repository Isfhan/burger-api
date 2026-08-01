import type { BurgerContext } from 'burger-api';

// Global hooks — apply to every request.
export const beforeRoute = [
    (ctx: BurgerContext) => {
        console.log('Global middleware executed for request:', ctx.url);
        return undefined;
    },
];
