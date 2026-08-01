// The logRequest macro is registered in index.ts.
// This file adds route-specific hooks that compose with macros.
export const beforeRoute = [
    (ctx: any) => {
        // Simulate a logged-in user for demo purposes
        ctx.services = ctx.services ?? {};
        ctx.services.user = { name: 'Alice', role: 'admin' };
    },
];
