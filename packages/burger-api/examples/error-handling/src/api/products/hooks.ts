import type { BurgerContext, BurgerNext } from 'burger-api';

export const beforeRoute = [
    (ctx: BurgerContext): BurgerNext => {
        console.log('Products Hook');
        return undefined;
    },
];
