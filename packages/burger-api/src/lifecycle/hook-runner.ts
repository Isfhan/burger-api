import type { BurgerContext } from '../context/context';
import type { BurgerNext, RequestHandler } from '../types/index';
import type { Hook } from './types';

/**
 * Runs a single hook followed by the handler.
 * Reused by the router compiler so the compiled handlers share the exact
 * same hook execution semantics.
 */
async function runSingleHook(
    ctx: BurgerContext,
    hook: Hook,
    handler: RequestHandler
): Promise<Response> {
    const result = await hook(ctx) as BurgerNext;

    // Short-circuit with Response
    if (result instanceof Response) {
        return result;
    }

    // Transform response after handler
    if (typeof result === 'function') {
        return result(await handler(ctx));
    }

    // Continue to handler
    return handler(ctx);
}

/**
 * Runs an ordered hook chain followed by the handler.
 *
 * How it works:
 * 1. Run each hook in order
 * 2. If hook returns Response → stop and send that response
 * 3. If hook returns undefined → continue to next hook
 * 4. If hook returns function → save it to transform the final response later
 * 5. After all hooks, run the handler
 * 6. Apply all saved "after" functions to the response (in reverse order)
 */
async function runHookChain(
    ctx: BurgerContext,
    hooks: Hook[],
    handler: RequestHandler
): Promise<Response> {
    const len = hooks.length;

    // Fast path: two hooks (common: CORS + logger, or auth + logger)
    if (len === 2) {
        // First hook
        const result1 = await hooks[0](ctx) as BurgerNext;
        if (result1 instanceof Response) {
            return result1;
        }

        // Second hook
        const result2 = await hooks[1](ctx) as BurgerNext;
        if (result2 instanceof Response) {
            // Apply first hook's after function if exists
            if (typeof result1 === 'function') {
                return result1(result2);
            }
            return result2;
        }

        // Run handler
        let response = await handler(ctx);

        // Apply after functions in reverse order (manual unroll)
        if (typeof result2 === 'function') {
            response = await result2(response);
        }
        if (typeof result1 === 'function') {
            response = await result1(response);
        }

        return response;
    }

    // General path: 3+ hooks (less common)
    // Pre-allocate array with exact size to avoid dynamic resizing
    const afterStack = new Array(len);
    let afterCount = 0;

    // Run each hook
    for (let i = 0; i < len; i++) {
        const result = await hooks[i](ctx) as BurgerNext;

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

    // All hooks passed - run handler
    let response = await handler(ctx);

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
 * Runs the hook chain (if any) for a compiled handler.
 * Preserves the 0/1/2/3+ fast paths.
 */
export function runHooks(
    ctx: BurgerContext,
    hooks: Hook[],
    handler: RequestHandler
): Promise<Response> {
    if (hooks.length === 0) return Promise.resolve(handler(ctx));
    if (hooks.length === 1)
        return runSingleHook(ctx, hooks[0], handler);
    return runHookChain(ctx, hooks, handler);
}
