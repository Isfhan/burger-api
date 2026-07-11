import type { BurgerRequest, Middleware, RequestHandler } from '../types/index';

/**
 * Runs a single middleware followed by the handler.
 * Reused by the router compiler so the compiled handlers share the exact
 * same middleware execution semantics as the legacy inline handlers.
 */
export async function runSingleMiddleware(
    request: BurgerRequest,
    middleware: Middleware,
    handler: RequestHandler
): Promise<Response> {
    const result = await middleware(request);

    // Short-circuit with Response
    if (result instanceof Response) {
        return result;
    }

    // Transform response after handler
    if (typeof result === 'function') {
        return result(await handler(request));
    }

    // Continue to handler
    return handler(request);
}

/**
 * Runs an ordered middleware chain followed by the handler.
 *
 * How it works:
 * 1. Run each middleware in order
 * 2. If middleware returns Response → stop and send that response
 * 3. If middleware returns undefined → continue to next middleware
 * 4. If middleware returns function → save it to transform the final response later
 * 5. After all middlewares, run the handler
 * 6. Apply all saved "after" functions to the response (in reverse order)
 */
export async function runMiddleware(
    request: BurgerRequest,
    middlewares: Middleware[],
    handler: RequestHandler
): Promise<Response> {
    const len = middlewares.length;

    // Fast path: two middlewares (common: CORS + logger, or auth + logger)
    if (len === 2) {
        // First middleware
        const result1 = await middlewares[0](request);
        if (result1 instanceof Response) {
            return result1;
        }

        // Second middleware
        const result2 = await middlewares[1](request);
        if (result2 instanceof Response) {
            // Apply first middleware's after function if exists
            if (typeof result1 === 'function') {
                return result1(result2);
            }
            return result2;
        }

        // Run handler
        let response = await handler(request);

        // Apply after functions in reverse order (manual unroll)
        if (typeof result2 === 'function') {
            response = await result2(response);
        }
        if (typeof result1 === 'function') {
            response = await result1(response);
        }

        return response;
    }

    // General path: 3+ middlewares (less common)
    // Pre-allocate array with exact size to avoid dynamic resizing
    const afterStack = new Array(len);
    let afterCount = 0;

    // Run each middleware
    for (let i = 0; i < len; i++) {
        const result = await middlewares[i](request);

        // Short-circuit with Response (check first - most common early exit)
        if (result instanceof Response) {
            // Apply collected "after" functions in reverse
            if (afterCount === 0) return result;
            if (afterCount === 1) return afterStack[0](result);

            // Multiple after functions
            let response = result;
            for (let j = afterCount - 1; j >= 0; j--) {
                response = await afterStack[j](response);
            }
            return response;
        }

        // Save function for later (check once, no double typeof check)
        if (typeof result === 'function') {
            afterStack[afterCount++] = result;
        }

        // undefined - continue (implicit, no check needed)
    }

    // All middlewares passed - run handler
    let response = await handler(request);

    // Apply "after" functions in reverse order
    // Fast paths for common cases
    if (afterCount === 0) return response;
    if (afterCount === 1) return afterStack[0](response);
    if (afterCount === 2) {
        response = await afterStack[1](response);
        return afterStack[0](response);
    }

    // General case: 3+ after functions
    for (let i = afterCount - 1; i >= 0; i--) {
        response = await afterStack[i](response);
    }

    return response;
}

/**
 * Runs the middleware chain (if any) for a compiled handler.
 * Preserves the 0/1/2/3+ fast paths from the legacy implementation.
 */
export function runWithMiddleware(
    request: BurgerRequest,
    middlewares: Middleware[],
    handler: RequestHandler
): Promise<Response> {
    if (middlewares.length === 0) return Promise.resolve(handler(request));
    if (middlewares.length === 1)
        return runSingleMiddleware(request, middlewares[0], handler);
    return runMiddleware(request, middlewares, handler);
}
