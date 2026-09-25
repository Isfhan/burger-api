import { Burger, toFetchHandler } from 'burger-api';
import type { BurgerContext } from 'burger-api';

/**
 * WinterCG entry for Deno (`deno serve`).
 *
 * `deno.json` maps `burger-api` to the npm package. Routes are declared
 * explicitly — no filesystem scanning at runtime, and no `bun` imports in
 * the module graph.
 */
const burger = new Burger({
    title: 'BurgerAPI on Deno',
    description: 'Deploy the same code to any WinterCG runtime',
    apiRoutes: [
        {
            path: '/api/hello',
            handlers: {
                GET: (ctx: BurgerContext) =>
                    Response.json({
                        message: 'Hello from BurgerAPI on Deno!',
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

export default { fetch: toFetchHandler(burger) } satisfies {
    fetch(request: Request): Response | Promise<Response>;
};
