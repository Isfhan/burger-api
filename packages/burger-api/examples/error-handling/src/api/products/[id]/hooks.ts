import type { BurgerContext, BurgerNext } from 'burger-api';

export const beforeRoute = [
    (ctx: BurgerContext): BurgerNext => {
        console.log('Product Detail Hook');
        return undefined;
    },
];
