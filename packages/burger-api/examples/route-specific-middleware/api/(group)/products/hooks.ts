import type { BurgerContext, BurgerNext } from '../../../../../src/index';

// Route lifecycle lives in hooks.ts (ROADMAP.md §3.4) — route.ts is handlers only.
// This replaces the former per-route `middleware` export.
export const beforeRoute: Array<(ctx: BurgerContext) => BurgerNext> = [
    (ctx: BurgerContext): BurgerNext => {
        console.log(
            'Product Route-specific hook executed for request:',
            ctx.url
        );
        return undefined;
    },
];
