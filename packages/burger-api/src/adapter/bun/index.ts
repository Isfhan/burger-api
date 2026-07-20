import { serve } from 'bun';
import { errorResponse } from '../../utils/error';
import type {
    AdapterStartOptions,
    RuntimeAdapter,
    ServerHandle,
} from '../types';

/**
 * The primary, optimized runtime adapter. Wraps `Bun.serve` + Bun's native
 * `routes` map for static dispatch, with `Router.fetch` as the fallback for
 * dynamic/wildcard routes (per `ROADMAP.md` §4.2 / Phase 1 hybrid router).
 *
 * This is the ONLY place in the framework that touches a Bun-specific server
 * bootstrap. The framework body (router, compiler, context) remains
 * Web-Standard so additional adapters can be added later without changes.
 */
export class BunAdapter implements RuntimeAdapter {
    start(opts: AdapterStartOptions): ServerHandle {
        const serverOptions = {
            hostname: opts.hostname,
            routes: opts.staticRoutes,
            fetch: async (request: Request) => {
                try {
                    return await opts.fetch(request);
                } catch (error) {
                    return errorResponse(
                        error,
                        request,
                        opts.debug ?? false
                    );
                }
            },
            error(error: Error) {
                console.error(error);
                return new Response(
                    `Internal Server Error: ${error.message}`,
                    {
                        status: 500,
                        headers: { 'Content-Type': 'text/plain' },
                    }
                );
            },
            port: opts.port,
        };
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
