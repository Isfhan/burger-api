import type { BurgerContext } from 'burger-api';

// Global hooks — apply to every request.
export const beforeRoute = [
    (ctx: BurgerContext) => {
        console.log('Global hook executed for request:', ctx.url);
        return undefined;
    },
];
