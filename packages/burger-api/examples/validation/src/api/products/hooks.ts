import type { BurgerContext, BurgerNext } from 'burger-api';

export const beforeRoute = [
    (ctx: BurgerContext): BurgerNext => {
        console.log(
            'Product Route-specific hook executed for request:',
            ctx.url
        );
        return undefined;
    },
];
