import type { CompiledHandler } from '../router/types';
import type { FetchHandler, RequestHandler } from '../types/index';
import type { HTMLBundle } from 'bun';

/**
 * Options the runtime passes to an adapter to boot the server.
 *
 * The framework body speaks Web Standard `Request`/`Response`; an adapter only
 * translates how a `Request` enters and a `Response` leaves. This keeps the
 * router and compiler runtime-agnostic (per `ROADMAP.md` §4.2). Bun is the
 * primary, optimized surface; other runtimes (Node, Deno, Workers, Edge) are
 * reached through additional adapters in a later phase — the contract here is
 * identical for all of them.
 */
export interface AdapterStartOptions {
    /**
     * Static routes fed to the runtime's native dispatch (Bun's `routes` map).
     * Built by `Router.staticRoutes()`; page routes may also be `HTMLBundle`s.
     */
    staticRoutes: Record<string, CompiledHandler | HTMLBundle | RequestHandler>;
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
    /** Optional WebSocket handlers (Bun-specific). */
    websocket?: any;
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
 */
export interface RuntimeAdapter {
    start(opts: AdapterStartOptions): ServerHandle;
}
