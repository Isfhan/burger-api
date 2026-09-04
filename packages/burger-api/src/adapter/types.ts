import type { CompiledHandler } from '../router/types.js';
import type { FetchHandler, RequestHandler } from '../types/index.js';

/**
 * Options the runtime passes to an adapter to boot the server.
 *
 * The framework body speaks Web Standard `Request`/`Response`; an adapter only
 * translates how a `Request` enters and a `Response` leaves. This keeps the
 * router and compiler runtime-agnostic. Bun is the primary, optimized surface;
 * other runtimes (Node 24+, Cloudflare Workers, Vercel, Deno Deploy) use the
 * `toFetchHandler` web-standard entry instead of an adapter.
 *
 * This is the shared, WinterCG-safe contract: no Bun types are referenced.
 * Bun-only options (native `HTMLBundle` static routes, WebSocket handlers)
 * live on `BunAdapterStartOptions` (see `adapter/bun/types.ts`).
 */
export interface AdapterStartOptions {
    /**
     * Static routes fed to the runtime's native dispatch (Bun's `routes` map).
     * Built by `Router.staticRoutes()`.
     */
    staticRoutes: Record<string, CompiledHandler | RequestHandler>;
    /** The `fetch` fallback for dynamic/wildcard routes (Router.fetch). */
    fetch: FetchHandler;
    /** The port to listen on. */
    port: number;
    /** Optional hostname to bind. */
    hostname?: string;
    /** Debug flag, forwarded for error rendering. */
    debug?: boolean;
    /** Optional callback invoked once the server is listening. */
    onListen?: () => void;
}

/**
 * A running server handle returned by an adapter. The framework uses it only
 * to stop the server (e.g. in tests / graceful shutdown).
 */
export interface ServerHandle {
    stop(): void;
}

/**
 * The runtime adapter seam. A concrete adapter wraps one runtime's server
 * bootstrap (`Bun.serve`, `Deno.serve`, `node:http`, etc.). Only this surface
 * touches runtime-specific APIs; everything else stays Web-Standard.
 *
 * Adapters are for long-lived servers. Deploy targets that only export a
 * `fetch` handler (Cloudflare Workers, Vercel, Deno Deploy, Node 24+) use
 * `toFetchHandler()` instead — no adapter is involved.
 */
export interface RuntimeAdapter {
    start(opts: AdapterStartOptions): ServerHandle;
}
