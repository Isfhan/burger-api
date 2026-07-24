import type { BurgerRequest, BurgerNext } from '../../../../../../src/index';

// Route lifecycle lives in hooks.ts (ROADMAP.md §3.4) — route.ts is handlers only.
// This replaces the former per-route `middleware` export.
export const beforeRoute: Array<(req: BurgerRequest) => BurgerNext> = [
    (req: BurgerRequest): BurgerNext => {
        console.log(
            'Profile Route-specific hook executed for request:',
            req.url
        );
        return undefined;
    },
];
