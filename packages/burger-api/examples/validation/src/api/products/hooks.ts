import type { BurgerContext, ForwardHookResult } from 'burger-api';

export const beforeRoute = [
    (ctx: BurgerContext): ForwardHookResult => {
        console.log(
            'Product Route-specific hook executed for request:',
            ctx.url
        );
        return undefined;
    },
];
