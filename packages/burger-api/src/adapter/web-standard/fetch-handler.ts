/**
 * Web-Standard (WinterCG) fetch entry.
 *
 * `toFetchHandler(burger)` turns a `Burger` app into a portable
 * `(request, ...env) => Promise<Response>` handler that runs anywhere
 * `Request`/`Response` exist:
 *
 * ```ts
 * // Cloudflare Workers / Vercel
 * export default { fetch: toFetchHandler(burger) };
 *
 * // Deno
 * Deno.serve(toFetchHandler(burger));
 * ```
 *
 * WinterCG targets must pass AOT routes (`apiRoutes`); pages are Bun-only.
 * A filesystem scan happens only in Bun dev when `apiDir` is set without
 * `apiRoutes`, so a scan-based app fails on non-Bun runtimes. No Bun imports
 * reach this module.
 */

import type { Burger } from '../../index.js';
import type { EnvFetchHandler } from '../../types/index.js';
import type {
    BurgerEnv,
    BurgerExecutionContext,
} from '../../context/context.js';

/**
 * The portable entry shape: a Web-Standard `Request` in, a `Response` out.
 *
 * `env` and `executionCtx` are the second/third arguments a WinterCG host
 * supplies (`fetch(request, env, ctx)`); they are bound onto every
 * `BurgerContext` (`ctx.env`, `ctx.executionCtx`). Extra positional arguments
 * are accepted and ignored for forward compatibility.
 */
export type FetchHandlerEntry = (
    request: Request,
    env?: BurgerEnv,
    executionCtx?: BurgerExecutionContext,
    ...rest: unknown[]
) => Promise<Response>;

/**
 * Returns a Web-Standard fetch handler for the given app.
 *
 * Routes are prepared lazily on the first call (AOT `apiRoutes`, or a one-time
 * filesystem scan in Bun dev); later calls dispatch directly. Prefer AOT
 * `apiRoutes` on WinterCG targets (no filesystem access).
 */
export function toFetchHandler(burger: Burger): FetchHandlerEntry {
    let prepared: Promise<EnvFetchHandler> | null = null;
    return (
        request: Request,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): Promise<Response> => {
        if (!prepared) {
            prepared = burger.fetchHandler();
        }
        return prepared.then((handler) =>
            handler(request, env, executionCtx)
        );
    };
}
