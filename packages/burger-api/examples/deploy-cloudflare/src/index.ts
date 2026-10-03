import { Burger, toFetchHandler } from 'burger-api';
import type { BurgerContext } from 'burger-api';

/**
 * WinterCG entry for Cloudflare Workers.
 *
 * Routes are declared explicitly — there is no filesystem scanning at
 * runtime, and the module graph contains no `bun` imports, so `wrangler`
 * (esbuild) bundles this file as-is for the Workers runtime.
 */
const burger = new Burger({
    title: 'BurgerAPI on Cloudflare Workers',
    description: 'Deploy the same code to any WinterCG runtime',
    apiRoutes: [
        {
            path: '/api/hello',
            handlers: {
                GET: (ctx: BurgerContext) =>
                    Response.json({
                        message: 'Hello from BurgerAPI on Cloudflare Workers!',
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

export default { fetch: toFetchHandler(burger) };
