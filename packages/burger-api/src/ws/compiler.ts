/**
 * Compiles scanned WebSocket routes into executable form.
 */

import type {
    WebSocketRouteDefinition,
    WebSocketHandlers,
    WebSocketHooks,
    WebSocketConfig,
    CompiledWebSocketRoute,
    WebSocketModule,
    WebSocketHooksModule,
    WebSocketConfigModule,
} from './types.js';

import type { ScannedWebSocketRoute } from './scanner.js';

/** Connection-level options — Bun.serve-wide, not per-route (see compile). */
const WS_TRANSPORT_KEYS = [
    'maxPayloadLength',
    'idleTimeout',
    'backpressureLimit',
    'closeOnBackpressureLimit',
    'compression',
] as const;

/**
 * WebSocket route compiler.
 */
export class WebSocketCompiler {
    private globalHooks?: WebSocketHooks;
    private globalConfig: WebSocketConfig = {};

    /**
     * Set global hooks (from src/hooks.ts or similar)
     */
    setGlobalHooks(hooks: WebSocketHooks): void {
        this.globalHooks = hooks;
    }

    /**
     * Set global config (from burger options)
     */
    setGlobalConfig(config: WebSocketConfig): void {
        this.globalConfig = config;
    }

    /**
     * Compile a scanned WebSocket route
     */
    async compile(
        scanned: ScannedWebSocketRoute
    ): Promise<CompiledWebSocketRoute> {
        // Import ws.ts module
        const wsModule = await importConvention<WebSocketModule>(
            scanned.wsFile,
            'route module',
            scanned.path
        );

        // Build handlers from module exports
        const handlers: WebSocketHandlers = {
            open: wsModule.open,
            message: wsModule.message,
            close: wsModule.close,
            drain: wsModule.drain,
            ping: wsModule.ping,
            pong: wsModule.pong,
        };

        // Import hooks if present
        let hooks: WebSocketHooks | undefined;
        if (scanned.hooksFile) {
            const hooksModule = await importConvention<WebSocketHooksModule>(
                scanned.hooksFile,
                'hooks module',
                scanned.path
            );
            hooks = {
                onOpen: hooksModule.onOpen,
                onMessage: hooksModule.onMessage,
                onClose: hooksModule.onClose,
            };
        }

        // Import config if present
        let routeConfig: WebSocketConfig = {};
        if (scanned.configFile) {
            const configModule = await importConvention<
                Record<string, unknown>
            >(scanned.configFile, 'config module', scanned.path);
            routeConfig =
                (configModule.default as WebSocketConfig) ??
                ({ ...configModule } as WebSocketConfig);

            // Connection-level options are Bun.serve-wide; a per-route value
            // cannot override them, so warn loud instead of ignoring it.
            for (const key of WS_TRANSPORT_KEYS) {
                if ((routeConfig as Record<string, unknown>)[key] !== undefined) {
                    console.warn(
                        `[burger-api] WebSocket route "${scanned.path}": config.${key} ` +
                            'is connection-level and can only be set globally via ' +
                            'burger.wsConfig() — the per-route value is ignored.'
                    );
                }
            }
        }

        // `auth` is merged deeply so a route-level `auth.roles` keeps a global
        // `auth.required`; either side being `false` disables auth.
        const globalAuth = this.globalConfig.auth;
        const routeAuth = routeConfig.auth;
        const mergedConfig: WebSocketConfig = {
            ...this.globalConfig,
            ...routeConfig,
        };
        if (globalAuth !== undefined || routeAuth !== undefined) {
            mergedConfig.auth =
                globalAuth === false || routeAuth === false
                    ? false
                    : {
                          ...(globalAuth === true
                              ? { required: true }
                              : typeof globalAuth === 'object'
                                ? globalAuth
                                : {}),
                          ...(routeAuth === true
                              ? { required: true }
                              : typeof routeAuth === 'object'
                                ? routeAuth
                                : {}),
                      };
        }

        // Merge global and route-specific hooks
        const mergedHooks: WebSocketHooks | undefined = this.mergeHooks(
            this.globalHooks,
            hooks
        );

        return {
            path: scanned.path,
            params: scanned.params,
            handlers,
            hooks: mergedHooks,
            config: mergedConfig,
        };
    }

    /**
     * Compile multiple scanned routes
     */
    async compileAll(
        scanned: ScannedWebSocketRoute[]
    ): Promise<CompiledWebSocketRoute[]> {
        const compiled: CompiledWebSocketRoute[] = [];

        for (const route of scanned) {
            try {
                const compiledRoute = await this.compile(route);
                compiled.push(compiledRoute);
            } catch (error) {
                const detail =
                    error instanceof Error ? error.message : String(error);
                throw new Error(
                    `[WebSocket] Failed to compile route "${route.path}": ${detail}`,
                    { cause: error }
                );
            }
        }

        return compiled;
    }

    /**
     * Merge global and route-specific hooks
     */
    private mergeHooks(
        global?: WebSocketHooks,
        route?: WebSocketHooks
    ): WebSocketHooks | undefined {
        return mergeWsHooks(global, route);
    }
}

/**
 * Imports a convention module, naming both the route and file on failure so
 * a broken module fails loud at startup instead of disappearing.
 */
async function importConvention<T>(
    file: string,
    kind: string,
    routePath: string
): Promise<T> {
    try {
        return (await import(file)) as T;
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
            `[WebSocket] Failed to load ${kind} for route "${routePath}" from "${file}": ${detail}`,
            { cause: error }
        );
    }
}

/**
 * Merges app-level and route WS hooks — global runs first, then route.
 * Shared by file-based, prebuilt (AOT) and programmatic routes.
 */
export function mergeWsHooks(
    global?: WebSocketHooks,
    route?: WebSocketHooks
): WebSocketHooks | undefined {
    if (!global?.onOpen && !global?.onMessage && !global?.onClose) {
        return route;
    }

    const merged: WebSocketHooks = {};

    if (global?.onOpen || route?.onOpen) {
        merged.onOpen = async (ws) => {
            if (global?.onOpen) await global.onOpen(ws);
            if (route?.onOpen) await route.onOpen(ws);
        };
    }

    if (global?.onMessage || route?.onMessage) {
        merged.onMessage = async (ws, message) => {
            if (global?.onMessage) await global.onMessage(ws, message);
            if (route?.onMessage) await route.onMessage(ws, message);
        };
    }

    if (global?.onClose || route?.onClose) {
        merged.onClose = async (ws, code, reason) => {
            if (global?.onClose) await global.onClose(ws, code, reason);
            if (route?.onClose) await route.onClose(ws, code, reason);
        };
    }

    return merged;
}
