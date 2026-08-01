import type { BurgerContext, BurgerNext } from 'burger-api';

export const beforeRoute = [
    (ctx: BurgerContext): BurgerNext => {
        console.log(
            'Product Route-specific middleware executed for request:',
            ctx.url
        );
        return undefined;
    },
];
