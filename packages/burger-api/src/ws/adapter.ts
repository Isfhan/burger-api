/**
 * WebSocket adapter
 * Integrates WebSocket router with Bun.serve()
 */

import type { WebSocketRouter } from './router';
import type { CompiledWebSocketRoute, BurgerWS, WebSocketConfig } from './types';
import { BurgerWSContext } from './types';
import { BurgerContext } from '../context/context';
import type { TransformMap } from '../lifecycle/types';
import { applyTransform } from '../lifecycle/transform';

/**
 * WebSocket adapter options
 */
export interface WebSocketAdapterOptions {
  /**
   * WebSocket router
   */
  router: WebSocketRouter;

  /**
   * Global WebSocket config
   */
  config?: WebSocketConfig;

  /**
   * Debug mode
   */
  debug?: boolean;

  /**
   * Application services (providers) to inject into WebSocket handlers
   */
  providers?: Map<string, unknown>;

  /**
   * Resolved plugin hooks for auth execution during upgrade
   */
  pluginTransform?: TransformMap;

  /**
   * Resolved plugin beforeRoute hooks for auth execution during upgrade
   */
  pluginBeforeRoute?: ((ctx: BurgerContext) => unknown | Promise<unknown>)[];
}

/**
 * WebSocket adapter
 * Creates Bun.serve() websocket option
 */
export class WebSocketAdapter {
  private router: WebSocketRouter;
  private config: WebSocketConfig;
  private debug: boolean;
  private providers?: Map<string, unknown>;
  private pluginTransform?: TransformMap;
  private pluginBeforeRoute?: ((ctx: BurgerContext) => unknown | Promise<unknown>)[];

  constructor(options: WebSocketAdapterOptions) {
    this.router = options.router;
    this.config = options.config ?? {};
    this.debug = options.debug ?? false;
    this.providers = options.providers;
    this.pluginTransform = options.pluginTransform;
    this.pluginBeforeRoute = options.pluginBeforeRoute;
  }

  /**
   * Create the websocket option for Bun.serve()
   */
  createWebSocketOption() {
    const self = this;

    return {
      open(ws: any) {
        const route = self.getRouteFromWs(ws);
        if (!route) {
          if (self.debug) {
            console.log('[WebSocket] No route found for connection');
          }
          return;
        }

        const burgerWs = self.createBurgerWS(ws);

        // Run hooks first
        if (route.hooks?.onOpen) {
          try {
            route.hooks.onOpen(burgerWs);
          } catch (error) {
            console.error('[WebSocket] onOpen hook error:', error);
          }
        }

        // Run handler
        if (route.handlers.open) {
          try {
            route.handlers.open(burgerWs);
          } catch (error) {
            console.error('[WebSocket] open handler error:', error);
          }
        }
      },

      message(ws: any, message: string | Buffer) {
        const route = self.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = self.createBurgerWS(ws);

        // Run hooks first
        if (route.hooks?.onMessage) {
          try {
            route.hooks.onMessage(burgerWs, message);
          } catch (error) {
            console.error('[WebSocket] onMessage hook error:', error);
          }
        }

        // Run handler
        if (route.handlers.message) {
          try {
            route.handlers.message(burgerWs, message);
          } catch (error) {
            console.error('[WebSocket] message handler error:', error);
          }
        }
      },

      close(ws: any, code: number, reason: string) {
        const route = self.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = self.createBurgerWS(ws);

        // Run hooks first
        if (route.hooks?.onClose) {
          try {
            route.hooks.onClose(burgerWs, code, reason);
          } catch (error) {
            console.error('[WebSocket] onClose hook error:', error);
          }
        }

        // Run handler
        if (route.handlers.close) {
          try {
            route.handlers.close(burgerWs, code, reason);
          } catch (error) {
            console.error('[WebSocket] close handler error:', error);
          }
        }
      },

      drain(ws: any) {
        const route = self.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = self.createBurgerWS(ws);

        if (route.handlers.drain) {
          try {
            route.handlers.drain(burgerWs);
          } catch (error) {
            console.error('[WebSocket] drain handler error:', error);
          }
        }
      },

      ping(ws: any) {
        const route = self.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = self.createBurgerWS(ws);

        if (route.handlers.ping) {
          try {
            route.handlers.ping(burgerWs);
          } catch (error) {
            console.error('[WebSocket] ping handler error:', error);
          }
        }
      },

      pong(ws: any) {
        const route = self.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = self.createBurgerWS(ws);

        if (route.handlers.pong) {
          try {
            route.handlers.pong(burgerWs);
          } catch (error) {
            console.error('[WebSocket] pong handler error:', error);
          }
        }
      },
    };
  }

  /**
   * Create the fetch handler for WebSocket upgrade
   */
  createFetchHandler() {
    const self = this;

    return async (request: Request, server: any): Promise<Response | undefined> => {
      // Check if this is a WebSocket upgrade request
      const upgradeHeader = request.headers.get('upgrade');
      if (upgradeHeader?.toLowerCase() !== 'websocket') {
        return undefined;
      }

      // Extract path from URL
      const url = new URL(request.url);
      const path = url.pathname;

      // Match route
      const match = self.router.match(path);
      if (!match) {
        return new Response('WebSocket route not found', { status: 404 });
      }

      // Run auth hooks before upgrade
      const routeConfig = match.route.config;
      const authResult = await self.runAuthHooks(request, routeConfig);
      if (authResult.response) {
        return authResult.response;
      }

      // Upgrade the request — attach matched route with resolved params and user
      const upgradeData: Record<string, unknown> = {
        route: { ...match.route, params: match.params },
      };
      if (authResult.user !== undefined) {
        upgradeData.user = authResult.user;
      }

      const upgraded = server.upgrade(request, {
        data: upgradeData,
      });

      if (upgraded) {
        return undefined; // Bun automatically returns 101 Switching Protocols
      }

      return new Response('WebSocket upgrade failed', { status: 500 });
    };
  }

  /**
   * Get route from WebSocket data
   */
  private getRouteFromWs(ws: any): CompiledWebSocketRoute | null {
    return ws.data?.route ?? null;
  }

  /**
   * Create BurgerWS context from Bun's ServerWebSocket
   */
  private createBurgerWS(ws: any): BurgerWS {
    return new BurgerWSContext(ws, this.providers);
  }

  /**
   * Run auth hooks during WebSocket upgrade request.
   * Returns a Response if auth fails, or undefined if auth succeeds.
   */
  private async runAuthHooks(
    request: Request,
    routeConfig?: WebSocketConfig
  ): Promise<{ response?: Response; user?: unknown }> {
    // No auth plugins registered — skip
    if (!this.pluginTransform && (!this.pluginBeforeRoute || this.pluginBeforeRoute.length === 0)) {
      return {};
    }

    // Check if auth is explicitly disabled for this route
    const authDisabled = routeConfig?.auth === false ||
      (routeConfig?.auth !== undefined && routeConfig.auth.required === false);

    // Create a temporary BurgerContext for the upgrade request
    const ctx = BurgerContext.create(
      request,
      {},
      undefined,
      this.providers,
      routeConfig as Record<string, unknown> | undefined
    );

    try {
      // Always run transform hooks (parse JWT, load user, etc.)
      // These set ctx.user which may be needed even when auth is disabled
      if (this.pluginTransform) {
        await applyTransform(ctx, this.pluginTransform);
      }

      // Skip beforeRoute hooks if auth is explicitly disabled
      if (!authDisabled && this.pluginBeforeRoute) {
        for (const hook of this.pluginBeforeRoute) {
          const result = await hook(ctx);
          // If hook returns a Response, auth failed
          if (result instanceof Response) {
            return { response: result };
          }
        }
      }

      // Extract user from context (set by transform hooks)
      const user = (ctx as any).user;

      // If auth is required but no user was attached, reject
      if (!authDisabled && routeConfig?.auth && typeof routeConfig.auth === 'object' && routeConfig.auth.required && !user) {
        return {
          response: new Response(
            JSON.stringify({
              type: 'https://burger-api.com/errors/unauthorized',
              title: 'Unauthorized',
              status: 401,
              detail: 'Authentication required',
            }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/problem+json' },
            }
          ),
        };
      }

      return { user };
    } catch (error) {
      // Auth hook threw an error — determine correct status
      if (this.debug) {
        console.error('[WebSocket] Auth hook error:', error);
      }
      const status = (error as any)?.status ?? 401;
      const title = status === 403 ? 'Forbidden' : 'Unauthorized';
      const type = status === 403
        ? 'https://burger-api.com/errors/forbidden'
        : 'https://burger-api.com/errors/unauthorized';
      return {
        response: new Response(
          JSON.stringify({
            type,
            title,
            status,
            detail: error instanceof Error ? error.message : 'Authentication failed',
          }),
          {
            status,
            headers: { 'Content-Type': 'application/problem+json' },
          }
        ),
      };
    }
  }
}
