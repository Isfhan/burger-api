import { serve } from 'bun';
import {
    renderHTTPError,
    logUnhandledError,
} from '../../errors/http-error.js';
import type {
    RuntimeAdapter,
    ServerHandle,
} from '../types.js';
import type { BunAdapterStartOptions } from './types.js';

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
                    const isDev =
                        opts.debug ?? process.env.NODE_ENV !== 'production';
                    const response = renderHTTPError(error, isDev);
                    if (response.status >= 500) {
                        logUnhandledError(request.method, request.url, error);
                    }
                    return response;
                }
            },
            error(error: Error) {
                // Server-level fallback (never for normal request errors,
                // which flow through `fetch`): log server-side only, and
                // never echo `error.message` to clients.
                console.error(error);
                return new Response('Internal Server Error', {
                    status: 500,
                    headers: { 'Content-Type': 'text/plain' },
                });
            },
            port: opts.port,
        };
        if (opts.maxRequestBodySize !== undefined) {
            serverOptions.maxRequestBodySize = opts.maxRequestBodySize;
        }

        // Add WebSocket handlers if provided
        if (opts.websocket) {
            serverOptions.websocket = opts.websocket;
        }

        let server: ReturnType<typeof serve>;
        try {
            server = serve(serverOptions as Parameters<typeof serve>[0]);
        } catch (error) {
            // A busy port is an operator problem, not a framework crash:
            // one clean line instead of a stack trace.
            if ((error as { code?: string })?.code === 'EADDRINUSE') {
                console.error(
                    `Port ${opts.port} is already in use. Stop the other process or set PORT / --port.`
                );
                process.exit(1);
            }
            throw error;
        }

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
