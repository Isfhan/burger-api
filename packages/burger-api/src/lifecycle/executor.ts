import type { BurgerRequest, RequestHandler } from '../types/index';
import type { HookPlan, Hook, ErrorHook } from './types';
import { runWithMiddleware } from '../middleware/runner';
import { methodNotAllowed } from '../utils/response';
import { applyDerive } from './provide';

/**
 * Runs the frozen {@link HookPlan} inside the single request pipeline.
 *
 * Fixed forward order (Phase 4, ROADMAP.md §4.1):
 *   beforeHandle (validation pinned at [0], then user hooks)
 *     → handler → afterHandle → onResponse
 *
 * On throw the {@link HookPlan#onError} chain is dispatched nearest-first
 * (route → global). If no `onError` handles the error it re-throws so the
 * adapter's `errorResponse` fallback catches it.
 *
 * `applySet` (always last) is applied by the caller (`buildCompiledHandler`).
 */
export async function executeHookPlan(
    ctx: unknown,
    plan: HookPlan,
    handlers: { [method: string]: RequestHandler },
    request: Request
): Promise<Response> {
    const burgerReq = ctx as unknown as BurgerRequest;
    const method = request.method;

    let handler = handlers[method];
    const headFallback = !handler && method === 'HEAD' && !!handlers.GET;
    if (headFallback) handler = handlers.GET;
    if (!handler) {
        return methodNotAllowed('');
    }

    try {
        // Phase 4 M3: `provide` runs after beforeHandle but before the handler.
        // Wrap the handler to inject provided values between the two stages.
        const wrappedHandler: RequestHandler = plan.provide
            ? (req) => {
                  applyDerive(req, plan.provide!);
                  return handler(req);
              }
            : handler;

        let response = await runWithMiddleware(
            burgerReq,
            plan.beforeHandle as unknown as Parameters<typeof runWithMiddleware>[1],
            wrappedHandler
        );

        response = await runResponsePhase(plan.afterHandle, burgerReq, response);
        response = await runResponsePhase(plan.onResponse, burgerReq, response);

        return response;
    } catch (error) {
        return dispatchOnError(error, plan.onError, burgerReq);
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
    req: BurgerRequest
): Promise<Response> {
    const err = error instanceof Error ? error : new Error(String(error));
    for (const hook of onErrorHooks) {
        try {
            const result = await hook(err, req);
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
 * Runs one response-phase (`afterHandle` / `onResponse`). Each hook may return
 * a `Response` (replace), a transform function `(res) => Response` (transform),
 * or `undefined` / `void` (continue). ROADMAP-phase4 §4.9.
 */
async function runResponsePhase(
    hooks: Hook[],
    req: BurgerRequest,
    response: Response
): Promise<Response> {
    let res = response;
    for (let i = 0; i < hooks.length; i++) {
        const result = await hooks[i](req);
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


