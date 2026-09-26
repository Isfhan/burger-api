import type { BurgerContext } from '../context/context.js';
import type { RequestHandler } from '../types/index.js';
import type { ForwardHook, ResponseHook } from './types.js';
import { isThenable } from '../utils/thenable.js';

/** Either hook kind — both share the same runtime 3-way return contract. */
type RunnerHook = ForwardHook | ResponseHook;

/**
 * Runs a single hook followed by the handler.
 * Reused by the router compiler so the compiled handlers share the exact
 * same hook execution semantics.
 */
async function runSingleHook(
    ctx: BurgerContext,
    hook: RunnerHook,
    handler: RequestHandler
): Promise<Response> {
    // Sync-first: a plain hook result continues without a microtask.
    let result = hook(ctx);
    if (isThenable(result)) result = await result;

    // Short-circuit with Response
    if (result instanceof Response) {
        return result;
    }

    // Transform response after handler
    if (typeof result === 'function') {
        let response = handler(ctx);
        if (isThenable(response)) response = await response;
        let mapped = result(response);
        if (isThenable(mapped)) mapped = await mapped;
        return mapped;
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
    hooks: RunnerHook[],
    handler: RequestHandler
): Promise<Response> {
    const len = hooks.length;

    // Fast path: two hooks (common: CORS + logger, or auth + logger)
    if (len === 2) {
        // Length guards guarantee the elements; the `!` is safe.
        const first = hooks[0]!;
        const second = hooks[1]!;

        // First hook (sync-first: no microtask when it returned a plain value)
        let result1 = first(ctx);
        if (isThenable(result1)) result1 = await result1;
        if (result1 instanceof Response) {
            return result1;
        }

        // Second hook
        let result2 = second(ctx);
        if (isThenable(result2)) result2 = await result2;
        if (result2 instanceof Response) {
            // Apply first hook's after function if exists
            if (typeof result1 === 'function') {
                let mapped = result1(result2);
                if (isThenable(mapped)) mapped = await mapped;
                return mapped;
            }
            return result2;
        }

        // Run handler
        let response = handler(ctx);
        if (isThenable(response)) response = await response;

        // Apply after functions in reverse order (manual unroll)
        if (typeof result2 === 'function') {
            let mapped = result2(response);
            if (isThenable(mapped)) mapped = await mapped;
            response = mapped;
        }
        if (typeof result1 === 'function') {
            let mapped = result1(response);
            if (isThenable(mapped)) mapped = await mapped;
            response = mapped;
        }

        return response;
    }

    // General path: 3+ hooks (less common)
    // Pre-allocate array with exact size to avoid dynamic resizing
    const afterStack: ((r: Response) => Response | Promise<Response>)[] =
        new Array(len);
    let afterCount = 0;

    // Run each hook (sync-first: a plain hook result never yields)
    for (let i = 0; i < len; i++) {
        let result = hooks[i]!(ctx);
        if (isThenable(result)) result = await result;

        // Short-circuit with Response (check first - most common early exit)
        if (result instanceof Response) {
            // Apply collected "after" functions in reverse
            if (afterCount === 0) return result;
            if (afterCount === 1) return afterStack[0]!(result);

            // Multiple after functions
            let response = result;
            for (let j = afterCount - 1; j >= 0; j--) {
                let mapped = afterStack[j]!(response);
                if (isThenable(mapped)) mapped = await mapped;
                response = mapped;
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
    let response = handler(ctx);
    if (isThenable(response)) response = await response;

    // Apply "after" functions in reverse order
    // Fast paths for common cases
    if (afterCount === 0) return response;
    if (afterCount === 1) {
        let mapped = afterStack[0]!(response);
        if (isThenable(mapped)) mapped = await mapped;
        return mapped;
    }
    if (afterCount === 2) {
        let mapped = afterStack[1]!(response);
        if (isThenable(mapped)) mapped = await mapped;
        response = mapped;
        mapped = afterStack[0]!(response);
        if (isThenable(mapped)) mapped = await mapped;
        return mapped;
    }

    // General case: 3+ after functions
    for (let i = afterCount - 1; i >= 0; i--) {
        let mapped = afterStack[i]!(response);
        if (isThenable(mapped)) mapped = await mapped;
        response = mapped;
    }

    return response;
}

/**
 * Runs the hook chain (if any) for a compiled handler.
 * Preserves the 0/1/2/3+ fast paths.
 */
export function runHooks(
    ctx: BurgerContext,
    hooks: RunnerHook[],
    handler: RequestHandler
): Promise<Response> {
    if (hooks.length === 0) return Promise.resolve(handler(ctx));
    if (hooks.length === 1) return runSingleHook(ctx, hooks[0]!, handler);
    return runHookChain(ctx, hooks, handler);
}
