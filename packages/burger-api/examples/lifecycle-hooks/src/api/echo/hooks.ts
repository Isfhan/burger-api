import type { BurgerContext } from 'burger-api';

// Route-specific hooks — apply only to this route.
// Global hooks (hooks.ts at app root) run first, then route hooks.
export const beforeRoute = [
    (ctx: BurgerContext) => {
        const r = ctx as unknown as { order: string[]; hookRan: string };
        r.order = r.order ?? [];
        r.order.push('route');
        r.hookRan = 'before';
        return undefined;
    },
];
