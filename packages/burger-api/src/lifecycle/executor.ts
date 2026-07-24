import type { BurgerContext } from '../context/context';
import type { RequestHandler } from '../types/index';
import type { HookPlan, Hook, ErrorHook } from './types';
import { runHooks } from './hook-runner';
import { methodNotAllowed } from '../utils/response';
import { applyTransform } from './transform';

/**
 * Runs the frozen {@link HookPlan} inside the single request pipeline.
 *
 * Fixed forward order:
 *   beforeRoute (validation pinned at [0], then user hooks)
 *     → handler → afterRoute → mapResponse
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
        // `transform` runs after beforeRoute but before the handler.
        // Wrap the handler to inject transformed values between the two stages.
        const wrappedHandler: RequestHandler = plan.transform
            ? (c) => {
                  applyTransform(c, plan.transform!);
                  return handler(c);
              }
            : handler;

        let response = await runHooks(
            ctx,
            plan.beforeRoute as unknown as Hook[],
            wrappedHandler
        );

        response = await runResponsePhase(plan.afterRoute, ctx, response);
        response = await runResponsePhase(plan.mapResponse, ctx, response);

        return response;
    } catch (error) {
        return dispatchOnError(error, plan.onError, ctx);
    }
}

/**
 * Dispatches an error through the `onError` hook chain (nearest-first).
 *
 * Each hook may return a `Response` to handle the error. If a hook itself
 * throws it is silently skipped (no recursion). Returns the first `Response`
 * an `onError` returns, or re-throws the original error when no hook handles
 * it — the adapter then falls through to `errorResponse`.
 */
async function dispatchOnError(
    error: unknown,
    onErrorHooks: ErrorHook[],
    ctx: BurgerContext
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
    throw error;
}

/**
 * Runs one response-phase (`afterRoute` / `mapResponse`). Each hook may return
 * a `Response` (replace), a transform function `(res) => Response` (transform),
 * or `undefined` / `void` (continue).
 */
async function runResponsePhase(
    hooks: Hook[],
    ctx: BurgerContext,
    response: Response
): Promise<Response> {
    let res = response;
    for (let i = 0; i < hooks.length; i++) {
        const result = await hooks[i](ctx);
        if (result instanceof Response) {
            res = result;
            continue;
        }
        if (typeof result === 'function') {
            res = await (result as (r: Response) => Promise<Response>)(res);
            continue;
        }
        // undefined / void → continue
    }
    return res;
}
