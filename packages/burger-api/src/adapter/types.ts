import type {
    CompiledHandler,
    NativeMethodHandlers,
} from '../router/types.js';
import type { FetchHandler, RequestHandler } from '../types/index.js';

/**
 * Options the runtime passes to an adapter to boot the server.
 *
 * Shared, WinterCG-safe contract: no Bun types. An adapter only translates how
 * a `Request` enters and a `Response` leaves, keeping the core runtime-agnostic.
 * Bun-only options live on `BunAdapterStartOptions` (`adapter/bun/types.ts`).
 */
export interface AdapterStartOptions {
    /**
     * Static routes for the runtime's native dispatch (Bun's `routes` map).
     * Built by the router as method objects; page routes may be plain handlers.
     */
    staticRoutes: Record<
        string,
        CompiledHandler | RequestHandler | NativeMethodHandlers
    >;
    /** The `fetch` fallback for dynamic/wildcard routes (Router.fetch). */
    fetch: FetchHandler;
    /** The port to listen on. */
    port: number;
    /** Optional hostname to bind. */
    hostname?: string;
    /** Debug flag, forwarded for error rendering. */
    debug?: boolean;
    /** Maximum request body size in bytes (runtime default when unset). */
    maxRequestBodySize?: number;
    /** Optional callback invoked once the server is listening. */
    onListen?: () => void;
    /**
     * Optional callback with the raw runtime server handle right after it
     * starts; used to record the server once for lazy `ctx.ip` resolution.
     */
    onServer?: (server: unknown) => void;
}

/**
 * A running server handle. Used only to stop the server (tests / graceful
 * shutdown).
 */
export interface ServerHandle {
    stop(): void;
}

/**
 * The runtime adapter seam. A concrete adapter wraps one runtime's server
 * bootstrap (`Bun.serve`, `Deno.serve`, `node:http`, etc.); only this surface
 * touches runtime-specific APIs. Deploy targets that export a `fetch` handler
 * (Workers, Vercel, Deno Deploy, Node 24+) use `toFetchHandler()` instead.
 */
export interface RuntimeAdapter {
    start(opts: AdapterStartOptions): ServerHandle;
}
