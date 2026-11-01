import type { BurgerContext } from 'burger-api';

// Global hooks — apply to every request.
// This file lives at the app root (sibling of index.ts), NOT inside api/.
// Vision hook names: onRequest, transform, beforeRoute, afterRoute, mapResponse, onError
export const beforeRoute = [
    (ctx: BurgerContext) => {
        const r = ctx as unknown as { order: string[] };
        r.order = r.order ?? [];
        r.order.push('global');
        return undefined;
    },
];
