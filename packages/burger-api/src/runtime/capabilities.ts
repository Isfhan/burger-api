/**
 * Runtime-capability model: what each `burger-api build --target` platform
 * supports. Pure data, zero platform imports.
 *
 * Capability is a build-time property, not reliably detectable at request
 * time (Vercel and plain Node look identical via `globalThis`), so a build
 * declares its target up front (`ServerOptions.runtimeTarget`).
 *
 * Single source of truth for the CLI's build-time validation (e.g. rejecting
 * a WebSocket route on `--target=vercel`) and the docs compatibility page.
 */

export type RuntimeTarget = 'bun' | 'node' | 'cloudflare' | 'deno' | 'vercel';

export interface RuntimeCapability {
    /** Web-standard HTTP request/response handling. Every target speaks `fetch`. */
    http: true;
    /** Persistent WebSocket upgrades. */
    websocket: boolean;
    /**
     * This target's static-asset story. `'disk'` targets can also serve
     * `burger-api build`'s embedded assets (no fs needed); `'platform-native'`
     * targets should prefer the platform's own static hosting.
     */
    staticFiles: 'disk' | 'platform-native';
    /** Direct filesystem access at request time. */
    filesystem: boolean;
    /** A long-running process rather than a per-invocation cold start. */
    persistentProcess: boolean;
}

export const RUNTIME_CAPABILITIES: Record<RuntimeTarget, RuntimeCapability> = {
    bun: {
        http: true,
        websocket: true,
        staticFiles: 'disk',
        filesystem: true,
        persistentProcess: true,
    },
    node: {
        http: true,
        websocket: true,
        staticFiles: 'disk',
        filesystem: true,
        persistentProcess: true,
    },
    deno: {
        http: true,
        websocket: true,
        staticFiles: 'disk',
        filesystem: true,
        persistentProcess: true,
    },
    cloudflare: {
        http: true,
        websocket: true,
        staticFiles: 'platform-native',
        filesystem: false,
        persistentProcess: false,
    },
    vercel: {
        http: true,
        websocket: false,
        staticFiles: 'platform-native',
        filesystem: false,
        persistentProcess: false,
    },
};
