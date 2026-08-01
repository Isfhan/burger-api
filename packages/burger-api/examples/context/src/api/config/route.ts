import type { BurgerContext } from 'burger-api';

export async function GET(ctx: BurgerContext) {
    const config = ctx.config;
    return Response.json({
        message: 'Route config from config.ts',
        config,
        cacheEnabled: config?.cache,
        cacheMaxAge: config?.cacheMaxAge,
    });
}
