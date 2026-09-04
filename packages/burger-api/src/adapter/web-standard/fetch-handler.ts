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
 *
 * // Node 24+
 * import { createServer } from 'node:http'; // or any fetch-based server
 * ```
 *
 * WinterCG targets must pass AOT routes (`apiRoutes` / `pageRoutes` for
 * pages is not supported — pages are Bun-only). A filesystem scan happens
 * only in Bun dev when the app was configured with `apiDir` and no
 * `apiRoutes`; on non-Bun runtimes there is no filesystem access, so a
 * scan-based app will fail there. No Bun imports reach this module: the Bun
 * adapter is loaded lazily by `Server` only when `serve()` is called.
 */

import type { Burger } from '../../index';
import type { EnvFetchHandler } from '../../types/index';
import type {
    BurgerEnv,
    BurgerExecutionContext,
} from '../../context/context';

/**
 * The portable entry shape: a Web-Standard `Request` in, a `Response` out.
 *
 * `env` and `executionCtx` are the second/third arguments a WinterCG host
 * supplies (`fetch(request, env, ctx)` — Cloudflare Workers, Vercel Edge,
 * Deno Deploy). They are bound onto every per-request `BurgerContext`
 * (`ctx.env`, `ctx.executionCtx`) so handlers access platform bindings
 * uniformly across runtimes. Extra positional arguments beyond those two
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
 * Routes are prepared lazily on the first call — AOT `apiRoutes` on deploy
 * targets, or a one-time filesystem scan in Bun dev when `apiDir` is set
 * without `apiRoutes`; every subsequent call dispatches directly. Prefer AOT
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
