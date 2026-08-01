// The rateLimit macro is registered in index.ts.
// This file adds route-specific hooks that compose with macros.
export const beforeRoute = [
    (ctx: any) => {
        // Initialize request count for rate limiting demo
        ctx._requestCount = 0;
    },
];
