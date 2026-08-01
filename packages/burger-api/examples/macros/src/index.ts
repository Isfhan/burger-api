import { Burger, setDir } from 'burger-api';
import type { RouteHooks } from 'burger-api';

const burger = new Burger({
    title: 'Macros Example',
    description: 'Demonstrates burger.macro() for reusable, parameterized hook factories.',
    apiDir: setDir(__dirname, 'api'),
});

// Macro: rate limit — tracks request count per invocation
burger.macro('rateLimit', (...args: unknown[]): RouteHooks => {
    const maxRequests = (args[0] as number) ?? 10;
    return {
        transform: {
            _requestCount: () => 0,
        },
        beforeRoute: [
            (ctx) => {
                const count = ((ctx as any)._requestCount ?? 0) + 1;
                (ctx as any)._requestCount = count;
                if (count > maxRequests) {
                    return new Response('Too Many Requests', { status: 429 });
                }
            },
        ],
    };
});

// Macro: log request method and path
burger.macro('logRequest', (): RouteHooks => ({
    beforeRoute: [
        (ctx) => {
            const url = new URL(ctx.url);
            console.log(`[macro-log] ${ctx.method} ${url.pathname}`);
        },
    ],
}));

const port = Number(process.env.PORT) || 4000;
burger.serve(port);
