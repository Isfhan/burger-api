import type { BurgerContext } from 'burger-api';

export const globalLogger = (ctx: BurgerContext) => {
    console.log(`[Logger] ${ctx.method} ${ctx.url}`);
    return undefined;
};

export const authGuard = (ctx: BurgerContext) => {
    const authHeader = ctx.headers.get('authorization');
    if (!authHeader) {
        console.log('[Auth Guard] No auth header - allowing request for demo');
    }
    return undefined;
};

export const rateLimiter = (ctx: BurgerContext) => {
    console.log('[Rate Limiter] Checking rate limits for:', ctx.url);
    return undefined;
};

export const corsMiddleware = (ctx: BurgerContext) => {
    return async (response: Response) => {
        const headers = new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    };
};

export const beforeRoute = [globalLogger, corsMiddleware, rateLimiter, authGuard];
