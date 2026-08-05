import { serve } from 'bun';
import { renderHTTPError } from '../../errors/http-error';
import type {
    RuntimeAdapter,
    ServerHandle,
} from '../types';
import type { BunAdapterStartOptions } from './types';

/**
 * The primary, optimized runtime adapter. Wraps `Bun.serve` + Bun's native
 * `routes` map for static dispatch, with `Router.fetch` as the fallback for
 * dynamic/wildcard routes (hybrid router).
 *
 * This is the ONLY place in the framework that touches a Bun-specific server
 * bootstrap. The framework body (router, compiler, context) remains
 * Web-Standard so additional adapters can be added later without changes.
 *
 * Loaded lazily by `Server` (dynamic import on first `serve()`), so
 * non-Bun bundles never import this module.
 */
export class BunAdapter implements RuntimeAdapter {
    start(opts: BunAdapterStartOptions): ServerHandle {
        const serverOptions: any = {
            hostname: opts.hostname,
            routes: opts.staticRoutes,
            fetch: async (request: Request, server: any) => {
                try {
                    return await opts.fetch(request, server);
                } catch (error) {
                    // Safety net: errors that escape the pipeline.
                    // +, all HTTPError subclasses are caught
                    // within dispatchOnError; this catches edge cases.
                    return renderHTTPError(error, opts.debug ?? false);
                }
            },
            error(error: Error) {
                console.error(error);
                return new Response(`Internal Server Error: ${error.message}`, {
                    status: 500,
                    headers: { 'Content-Type': 'text/plain' },
                });
            },
            port: opts.port,
        };

        // Add WebSocket handlers if provided
        if (opts.websocket) {
            serverOptions.websocket = opts.websocket;
        }

        const server = serve(serverOptions as Parameters<typeof serve>[0]);

        if (opts.onListen) {
            opts.onListen();
        } else {
            console.log(
                `🍔 BurgerAPI is running at: http://${
                    opts.hostname || 'localhost'
                }:${opts.port}`
            );
        }

        return {
            stop: () => server.stop(),
        };
    }
}
