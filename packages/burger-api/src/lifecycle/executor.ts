import type { BurgerContext } from '../context/context.js';
import type { RequestHandler } from '../types/index.js';
import type {
    HookPlan,
    ResponseHook,
    ErrorHook,
} from './types.js';
import { runHooks } from './hook-runner.js';
import { methodNotAllowed } from '../utils/response.js';
import { applyTransform } from './transform.js';
import { renderHTTPError, logUnhandledError } from '../errors/http-error.js';
import { ValidationError } from '../validation/error.js';
import { validateResponse } from '../validation/response.js';
import { isJsonContentType } from '../validation/validator.js';
import { resolveDebug } from '../utils/env.js';
import { isThenable } from '../utils/thenable.js';

/**
 * The global/plugin response hooks that run for every response the app
 * produces — matched routes carry them in their plans; non-route responses
 * (404/405/auto-OPTIONS, pages/assets/docs, onError renders) run them
 * directly. Compiled once at startup.
 */
export interface GlobalResponsePlan {
    afterRoute: ResponseHook[];
    mapResponse: ResponseHook[];
}

/** True when the plan carries at least one hook. */
export function hasGlobalResponseHooks(plan: GlobalResponsePlan): boolean {
    return plan.afterRoute.length > 0 || plan.mapResponse.length > 0;
}

/**
 * Runs the global response plan (afterRoute then mapResponse) for one
 * response.
 */
export async function runGlobalResponseHooks(
    plan: GlobalResponsePlan,
    ctx: BurgerContext,
    response: Response
): Promise<Response> {
    let res = response;
    if (plan.afterRoute.length > 0) {
        res = await runResponseHookList(plan.afterRoute, ctx, res);
    }
    if (plan.mapResponse.length > 0) {
        res = await runResponseHookList(plan.mapResponse, ctx, res);
    }
    return res;
}

/**
 * Wraps an onError-rendered response so the global response hooks still run.
 * A throwing hook must not mask the original error response, so it is logged
 * and skipped.
 */
export function globalErrorFinisher(
    plan: GlobalResponsePlan | undefined
): (response: Promise<Response>, ctx: BurgerContext) => Promise<Response> {
    if (!plan || !hasGlobalResponseHooks(plan)) {
        return (response) => response;
    }
    return async (response, ctx) => {
        let res = await response;
        try {
            res = await runGlobalResponseHooks(plan, ctx, res);
        } catch (hookError) {
            console.error(
                '[burger-api] global response hook threw while rendering an error:',
                hookError
            );
        }
        return res;
    };
}

/**
 * Runs the frozen {@link HookPlan} inside the single request pipeline.
 *
 * Forward order: transform → validation → beforeRoute → handler → afterRoute
 * → mapResponse. On throw the {@link HookPlan#onError} chain is dispatched
 * nearest-first (route → global). `applySet` is applied by the caller (the
 * compiled route+method executor in `router/compiler.ts`).
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

    return executeHookPlanForHandler(ctx, plan, handler, request);
}

/**
 * Runs the frozen {@link HookPlan} for an already-resolved handler. The
 * compiled route+method path resolves the handler at compile time, so the
 * interpreter must not repeat the method lookup.
 */
export async function executeHookPlanForHandler(
    ctx: BurgerContext,
    plan: HookPlan,
    handler: RequestHandler,
    request: Request
): Promise<Response> {
    const method = request.method;

    // Empty plan: the handler runs directly.
    if (
        plan.transform === undefined &&
        plan.validation === undefined &&
        plan.validators?.response === undefined &&
        plan.beforeRoute.length === 0 &&
        plan.afterRoute.length === 0 &&
        plan.mapResponse.length === 0
    ) {
        try {
            return await handler(ctx);
        } catch (error) {
            return globalErrorFinisher(plan.globalResponse)(
                dispatchOnError(
                    error,
                    plan.onError,
                    ctx,
                    plan.debug,
                    plan.validatorConfig
                ),
                ctx
            );
        }
    }

    try {
        // 1. Transform — inject derived values onto the context. Sync
        // factories resolve without yielding.
        if (plan.transform) {
            const transformed = applyTransform(ctx, plan.transform);
            if (isThenable(transformed)) await transformed;
        }

        // 2. Validation — framework-owned; throws ValidationError on failure.
        if (plan.validation) {
            const validated = plan.validation(ctx);
            if (isThenable(validated)) await validated;
        }

        // 3. beforeRoute → handler.
        let response = await runHooks(ctx, plan.beforeRoute, handler);

        // 4. Response validation — post-handler, pre-afterRoute; validates the
        // handler's return against declared response schemas (JSON only).
        if (plan.validators?.response) {
            try {
                const ct = response.headers.get('content-type') ?? '';
                if (isJsonContentType(ct)) {
                    // Clone to avoid consuming the body stream.
                    const clone = response.clone();
                    const body = await clone.json();
                    const outcome = validateResponse(
                        plan.validators,
                        method.toLowerCase(),
                        response.status,
                        body,
                        plan.validatorConfig ?? {},
                        resolveDebug(plan.debug)
                    );
                    // A failure replaces the response; afterRoute /
                    // mapResponse still run on it (e.g. CORS headers).
                    if (!outcome.ok && outcome.errorResponse) {
                        response = outcome.errorResponse;
                    }
                }
            } catch {
                // Response body not JSON or unparseable — skip validation.
            }
        }

        response = await runResponseHookList(plan.afterRoute, ctx, response);
        response = await runResponseHookList(plan.mapResponse, ctx, response);

        return response;
    } catch (error) {
        // The error render also gets the global/plugin response hooks
        // (route-level response hooks stay off the error path).
        return globalErrorFinisher(plan.globalResponse)(
            dispatchOnError(
                error,
                plan.onError,
                ctx,
                plan.debug,
                plan.validatorConfig
            ),
            ctx
        );
    }
}

/**
 * Dispatches an error through the `onError` hook chain (nearest-first).
 *
 * Each hook may return a `Response` to handle the error; a hook that throws
 * is skipped (no recursion). The thrown value is passed through unchanged —
 * objects carrying a `status` stay intact.
 *
 * Fallback: `HTTPError` renders an RFC 9457 Problem Details response,
 * `ValidationError` keeps its structured format, unknown errors are wrapped
 * in `HTTPError(500)`.
 */
export async function dispatchOnError(
    error: unknown,
    onErrorHooks: ErrorHook[],
    ctx: BurgerContext,
    debug?: boolean,
    validatorConfig?: import('../validation/types.js').ValidatorConfig
): Promise<Response> {
    for (const hook of onErrorHooks) {
        try {
            // Hooks may receive any thrown value; `Error` is the documented
            // contract.
            const result = await hook(error as Error, ctx);
            if (result instanceof Response) {
                return result;
            }
        } catch (hookError) {
            // onError threw — log it, skip to the next hook, never re-enter
            // onError. The original error still renders if none handles it.
            console.error(
                '[burger-api] onError hook threw; rendering the original error:',
                hookError
            );
        }
    }

    // Fallback for unhandled errors: RFC 9457. Debug mode includes stack and
    // cause; otherwise no internals.
    const isDev = resolveDebug(debug);

    // ValidationError retains its structured format (errorsBySlot grouping).
    if (error instanceof ValidationError) {
        return error.toResponse(isDev, validatorConfig);
    }

    // All other HTTPError subclasses and unknown errors → RFC 9457.
    const response = renderHTTPError(error, isDev);
    // No onError handled a server-side failure: log it, or it would vanish
    // (the client only sees a generic 500 in production).
    if (response.status >= 500) {
        logUnhandledError(ctx.method, ctx.url, error);
    }
    return response;
}

/**
 * Runs one response hook point (`afterRoute` / `mapResponse`). Each hook may
 * return a `Response` (replace), a transform function `(res) => Response`
 * (transform), or `undefined` / `void` (continue).
 *
 * Exported so the global/plugin response plan (used for 404/405/OPTIONS and
 * non-route responses) runs hooks with the exact same semantics.
 */
export async function runResponseHookList(
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
