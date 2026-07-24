import type { BurgerContext } from '../../../src/index';

// Export logger
export { globalLogger } from './logger';

// Auth guard middleware
export const authGuard = (
    ctx: BurgerContext
) => {
    // Simple demo auth check
    const authHeader = ctx.headers.get('authorization');
    if (!authHeader) {
        console.log('[Auth Guard] No auth header - allowing request for demo');
    }
    return undefined; // Continue to next middleware
};

// Rate limiter middleware
export const rateLimiter = (
    ctx: BurgerContext
) => {
    // Demo rate limiting
    console.log('[Rate Limiter] Checking rate limits for:', ctx.url);
    return undefined; // Continue to next middleware
};

// CORS middleware
export const corsMiddleware = (
    ctx: BurgerContext
) => {
    // Return a function to add CORS headers to the response
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

