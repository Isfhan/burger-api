/**
 * Runtime-capability model: what each `burger-api build --target` platform
 * actually supports. Pure data, zero platform imports — safe to import from
 * anywhere (core, the CLI, docs tooling).
 *
 * Capability here is a **build-time / deployment property, not something
 * reliably detectable at request time**: Vercel and plain Node are
 * structurally indistinguishable via `globalThis` alone (neither exposes a
 * distinguishing global the way Cloudflare's `WebSocketPair` or Deno's
 * `Deno.upgradeWebSocket` do). That's why a build declares its target up
 * front (`ServerOptions.runtimeTarget`, set by `burger-api build --target`)
 * instead of the runtime guessing — see `ws/adapter.ts`'s use of this table.
 *
 * This table is the single source of truth for both the CLI's build-time
 * validation (e.g. rejecting a WebSocket route on `--target=vercel`) and the
 * docs compatibility page, so the two can't drift apart the way
 * hand-maintained prose already has.
 */

export type RuntimeTarget = 'bun' | 'node' | 'cloudflare' | 'deno' | 'vercel';

export interface RuntimeCapability {
    /** Web-standard HTTP request/response handling. Every target speaks `fetch`. */
    http: true;
    /** Persistent WebSocket upgrades. */
    websocket: boolean;
    /**
     * The static-asset story this target is built around. `'disk'` targets
     * can also always serve `burger-api build`'s portable base64-embedded
     * assets (no fs needed); `'platform-native'` targets should prefer the
     * platform's own static hosting (Cloudflare Assets binding, Vercel's
     * `public/` + CDN) over framework-served assets.
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
