import type { BurgerContext, ForwardHookResult } from 'burger-api';

export const beforeRoute = [
    (ctx: BurgerContext): ForwardHookResult => {
        console.log('Product Detail Hook');
        return undefined;
    },
];
