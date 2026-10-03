import { serve } from 'bun';
import { renderUncaught } from '../../errors/http-error.js';
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
 * The only place in the framework that touches a Bun-specific server
 * bootstrap. Loaded lazily by `Server` on first `serve()`, so non-Bun bundles
 * never import this module.
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
                    // Safety net for errors that escape the pipeline.
                    // HTTPError subclasses are caught by dispatchOnError.
                    // This catches the rest — same renderer as the fetch path.
                    return renderUncaught(error, request, opts.debug);
                }
            },
            error(error: Error) {
                // Server-level fallback (normal request errors flow through
                // `fetch`): log server-side only; never echo `error.message`
                // to clients.
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
            // A busy port is an operator problem: throw one clear error the
            // caller (app entry, CLI child) can surface; never kill the
            // process from inside the adapter.
            if ((error as { code?: string })?.code === 'EADDRINUSE') {
                throw new Error(
                    `Port ${opts.port} is already in use. Stop the other process or set PORT / --port.`,
                    { cause: error }
                );
            }
            throw error;
        }

        // Hand the raw server to the framework once: the router records it as
        // the lazy `ctx.ip` source (no per-request WeakMap writes).
        opts.onServer?.(server);

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
