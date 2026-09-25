import { Burger, toFetchHandler } from 'burger-api';
import type { BurgerContext } from 'burger-api';

/**
 * WinterCG entry for Vercel Functions (Node.js runtime).
 *
 * Vercel serves this file at `/api`; `vercel.json` rewrites every path to it.
 * Routes are declared explicitly — no filesystem scanning at runtime, and no
 * `bun` imports in the module graph.
 */
const burger = new Burger({
    title: 'BurgerAPI on Vercel',
    description: 'Deploy the same code to any WinterCG runtime',
    apiRoutes: [
        {
            path: '/api/hello',
            handlers: {
                GET: (ctx: BurgerContext) =>
                    Response.json({
                        message: 'Hello from BurgerAPI on Vercel!',
                    }),
            },
            openapi: { get: { summary: 'Greeting', tags: ['hello'] } },
        },
        {
            path: '/api/users/:id',
            handlers: {
                GET: (ctx: BurgerContext) =>
                    Response.json({ id: ctx.params?.id ?? ""}),
            },
            openapi: { get: { summary: 'Get user by id', tags: ['users'] } },
        },
    ],
});

export const runtime = 'nodejs';

export default { fetch: toFetchHandler(burger) };
