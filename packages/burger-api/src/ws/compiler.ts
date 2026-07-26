/**
 * WebSocket compiler
 * Imports and compiles WebSocket handlers and hooks
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
} from './types';

import type { ScannedWebSocketRoute } from './scanner';

/**
 * WebSocket compiler
 * Compiles scanned WebSocket routes into executable form
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
  async compile(scanned: ScannedWebSocketRoute): Promise<CompiledWebSocketRoute> {
    // Import ws.ts module
    const wsModule = await import(scanned.wsFile) as WebSocketModule;

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
      const hooksModule = await import(scanned.hooksFile) as WebSocketHooksModule;
      hooks = {
        onOpen: hooksModule.onOpen,
        onMessage: hooksModule.onMessage,
        onClose: hooksModule.onClose,
      };
    }

    // Import config if present
    let routeConfig: WebSocketConfig = {};
    if (scanned.configFile) {
      const configModule = await import(scanned.configFile) as Record<string, unknown>;
      routeConfig = (configModule.default as WebSocketConfig) ?? { ...configModule } as WebSocketConfig;
    }

    // Merge global and route-specific config
    const mergedConfig: WebSocketConfig = {
      ...this.globalConfig,
      ...routeConfig,
    };

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
  async compileAll(scanned: ScannedWebSocketRoute[]): Promise<CompiledWebSocketRoute[]> {
    const compiled: CompiledWebSocketRoute[] = [];

    for (const route of scanned) {
      try {
        const compiledRoute = await this.compile(route);
        compiled.push(compiledRoute);
      } catch (error) {
        console.error(`[WebSocket] Failed to compile route: ${route.path}`, error);
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
    if (!global && !route) return undefined;

    const merged: WebSocketHooks = {};

    // onOpen: global runs first, then route
    if (global?.onOpen || route?.onOpen) {
      merged.onOpen = async (ws) => {
        if (global?.onOpen) await global.onOpen(ws);
        if (route?.onOpen) await route.onOpen(ws);
      };
    }

    // onMessage: global runs first, then route
    if (global?.onMessage || route?.onMessage) {
      merged.onMessage = async (ws, message) => {
        if (global?.onMessage) await global.onMessage(ws, message);
        if (route?.onMessage) await route.onMessage(ws, message);
      };
    }

    // onClose: global runs first, then route
    if (global?.onClose || route?.onClose) {
      merged.onClose = async (ws, code, reason) => {
        if (global?.onClose) await global.onClose(ws, code, reason);
        if (route?.onClose) await route.onClose(ws, code, reason);
      };
    }

    return merged;
  }
}
