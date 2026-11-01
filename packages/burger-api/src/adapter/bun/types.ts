import type { HTMLBundle } from 'bun';
import type {
    CompiledHandler,
    NativeMethodHandlers,
} from '../../router/types.js';
import type { RequestHandler } from '../../types/index.js';
import type { AdapterStartOptions } from '../types.js';

/**
 * Bun-only adapter options: native page `HTMLBundle`s and the Bun WebSocket
 * `serve` option, kept under `adapter/bun/` so shared adapter types stay free
 * of `bun` imports.
 */
export type BunAdapterStartOptions = AdapterStartOptions & {
    /** Static routes; page routes may also be `HTMLBundle`s (Bun-only). */
    staticRoutes: Record<
        string,
        CompiledHandler | HTMLBundle | NativeMethodHandlers | RequestHandler
    >;
    /** Optional WebSocket handlers (Bun-specific). */
    websocket?: unknown;
};
