import type { BurgerContext } from '../context/context';
import type { RequestHandler } from '../types/index';
import type {
    HookPlan,
    ResponseHook,
    ErrorHook,
} from './types';
import { runHooks } from './hook-runner';
import { methodNotAllowed } from '../utils/response';
import { applyTransform } from './transform';
import { HTTPError, renderHTTPError } from '../errors/http-error';
import { ValidationError } from '../validation/error';
import { validateResponse } from '../validation/response';

/**
 * Runs the frozen {@link HookPlan} inside the single request pipeline.
 *
 * Fixed forward order:
 * transform → validation → beforeRoute
 * → handler → afterRoute → mapResponse
 *
 * On throw the {@link HookPlan#onError} chain is dispatched nearest-first
 * (route → global). If no `onError` handles the error it re-throws so the
 * adapter's `errorResponse` fallback catches it.
 *
 * `applySet` (always last) is applied by the caller (`buildCompiledHandler`).
 */
export async function executeHookPlan(
    ctx: BurgerContext,
    plan: HookPlan,
    handlers: { [method: string]: RequestHandler },
    request: Request
): Promise<Response> {
    const method = request.method;

    let handler = handlers[method];
    const headFallback = !handler && method === 'HEAD' && !!handlers.GET;
    if (headFallback) handler = handlers.GET;
    if (!handler) {
        return methodNotAllowed('');
    }

    try {
        // 1. Transform — inject derived values onto the context.
        if (plan.transform) {
            await applyTransform(ctx, plan.transform);
        }

        // 2. Validation — framework-owned stage; throws ValidationError on failure.
        if (plan.validation) {
            await plan.validation(ctx);
        }

        // 3. beforeRoute → handler.
        let response = await runHooks(ctx, plan.beforeRoute, handler);

        // 4. Response validation — post-handler, pre-afterRoute.
        // Validates the handler's return against declared response schemas.
        if (plan.validators?.response) {
            try {
                // Only validate JSON responses.
                const ct = response.headers.get('content-type') ?? '';
                if (ct.includes('application/json')) {
                    // Clone to avoid consuming the body stream.
                    const clone = response.clone();
                    const body = await clone.json();
                    const outcome = validateResponse(
                        plan.validators,
                        method,
                        response.status,
                        body,
                        plan.validatorConfig ?? {},
                        plan.debug ?? false
                    );
                    if (!outcome.ok && outcome.errorResponse) {
                        return outcome.errorResponse;
                    }
                }
            } catch {
                // Response body not JSON or unparseable — skip validation.
            }
        }

        response = await runResponseHooks(plan.afterRoute, ctx, response);
        response = await runResponseHooks(plan.mapResponse, ctx, response);

        return response;
    } catch (error) {
        return dispatchOnError(
            error,
            plan.onError,
            ctx,
            plan.debug,
            plan.validatorConfig
        );
    }
}

/**
 * Dispatches an error through the `onError` hook chain (nearest-first).
 *
 * Each hook may return a `Response` to handle the error. If a hook itself
 * throws it is silently skipped (no recursion). Returns the first `Response`
 * an `onError` returns.
 *
 * Default fallback: unhandled `HTTPError` renders an RFC 9457 Problem Details
 * response. `ValidationError` retains its structured error format for backward
 * compatibility. Unknown errors are wrapped in `HTTPError(500)`.
 */
async function dispatchOnError(
    error: unknown,
    onErrorHooks: ErrorHook[],
    ctx: BurgerContext,
    debug?: boolean,
    validatorConfig?: import('../validation/types').ValidatorConfig
): Promise<Response> {
    const err = error instanceof Error ? error : new Error(String(error));
    for (const hook of onErrorHooks) {
        try {
            const result = await hook(err, ctx);
            if (result instanceof Response) {
                return result;
            }
        } catch {
            // onError threw — skip to next; never re-enter onError
        }
    }

    // Default fallback: unhandled errors → RFC 9457.
    // Dev mode: stack + cause included. Production: no internals.
    const isDev = debug ?? process.env.NODE_ENV !== 'production';

    // ValidationError retains its structured format (errorsBySlot grouping).
    if (error instanceof ValidationError) {
        return error.toResponse(isDev, validatorConfig);
    }

    // All other HTTPError subclasses and unknown errors → RFC 9457.
    return renderHTTPError(error, isDev);
}

/**
 * Runs one response hook point (`afterRoute` / `mapResponse`). Each hook may
 * return a `Response` (replace), a transform function `(res) => Response`
 * (transform), or `undefined` / `void` (continue).
 */
async function runResponseHooks(
    hooks: ResponseHook[],
    ctx: BurgerContext,
    response: Response
): Promise<Response> {
    let res = response;
    for (let i = 0; i < hooks.length; i++) {
        const result = await hooks[i]!(ctx);
        if (result instanceof Response) {
            res = result;
            continue;
        }
        if (typeof result === 'function') {
            res = await result(res);
            continue;
        }
        // undefined / void → continue
    }
    return res;
}
