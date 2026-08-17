/**
 * WebSocket adapter
 * Integrates WebSocket router with Bun.serve()
 */

import type { WebSocketRouter } from './router';
import type {
    CompiledWebSocketRoute,
    BurgerWS,
    WebSocketConfig,
} from './types';
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
 * The WebSocket option object handed to `Bun.serve`'s `websocket` key.
 * Framework handlers plus forwarded connection limits from `WebSocketConfig`.
 */
export interface WebSocketServeOption {
    open: (ws: any) => void | Promise<void>;
    message: (ws: any, message: string | Buffer) => void | Promise<void>;
    close: (ws: any, code: number, reason: string) => void | Promise<void>;
    drain: (ws: any) => void | Promise<void>;
    ping: (ws: any) => void | Promise<void>;
    pong: (ws: any) => void | Promise<void>;
    maxPayloadLength?: number;
    idleTimeout?: number;
    backpressureLimit?: number;
    closeOnBackpressureLimit?: boolean;
    compression?: boolean;
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
    private pluginBeforeRoute?: ((
        ctx: BurgerContext
    ) => unknown | Promise<unknown>)[];

    /** One context per connection, so `ws.data` mutations persist. */
    private wsContexts = new WeakMap<object, BurgerWS>();

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
    createWebSocketOption(): WebSocketServeOption {
        const self = this;

        // Forward connection limits to Bun.serve. Only defined keys are
        // emitted so Bun's defaults apply otherwise.
        const option: WebSocketServeOption = {
            open(ws: any) {
                return self.handleOpen(ws);
            },
            message(ws: any, message: string | Buffer) {
                return self.handleMessage(ws, message);
            },
            close(ws: any, code: number, reason: string) {
                return self.handleClose(ws, code, reason);
            },
            drain(ws: any) {
                return self.handleDrain(ws);
            },
            ping(ws: any) {
                return self.handlePing(ws);
            },
            pong(ws: any) {
                return self.handlePong(ws);
            },
        };
        if (this.config.maxPayloadLength !== undefined) {
            option.maxPayloadLength = this.config.maxPayloadLength;
        }
        if (this.config.idleTimeout !== undefined) {
            option.idleTimeout = this.config.idleTimeout;
        }
        if (this.config.backpressureLimit !== undefined) {
            option.backpressureLimit = this.config.backpressureLimit;
        }
        if (this.config.closeOnBackpressureLimit !== undefined) {
            option.closeOnBackpressureLimit =
                this.config.closeOnBackpressureLimit;
        }
        if (this.config.compression !== undefined) {
            option.compression = this.config.compression;
        }
        return option;
    }

    private async handleOpen(ws: any): Promise<void> {
        const route = this.getRouteFromWs(ws);
        if (!route) {
            if (this.debug) {
                console.log('[WebSocket] No route found for connection');
            }
            return;
        }

        const burgerWs = this.createBurgerWS(ws);

        // Run hooks first
        if (route.hooks?.onOpen) {
            try {
                await route.hooks.onOpen(burgerWs);
            } catch (error) {
                console.error('[WebSocket] onOpen hook error:', error);
            }
        }

        // Run handler
        if (route.handlers.open) {
            try {
                await route.handlers.open(burgerWs);
            } catch (error) {
                console.error('[WebSocket] open handler error:', error);
            }
        }
    }

    private async handleMessage(
        ws: any,
        message: string | Buffer
    ): Promise<void> {
        const route = this.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = this.createBurgerWS(ws);

        // Run hooks first
        if (route.hooks?.onMessage) {
            try {
                await route.hooks.onMessage(burgerWs, message);
            } catch (error) {
                console.error('[WebSocket] onMessage hook error:', error);
            }
        }

        // Run handler
        if (route.handlers.message) {
            try {
                await route.handlers.message(burgerWs, message);
            } catch (error) {
                console.error('[WebSocket] message handler error:', error);
            }
        }
    }

    private async handleClose(
        ws: any,
        code: number,
        reason: string
    ): Promise<void> {
        const route = this.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = this.createBurgerWS(ws);

        // Run hooks first
        if (route.hooks?.onClose) {
            try {
                await route.hooks.onClose(burgerWs, code, reason);
            } catch (error) {
                console.error('[WebSocket] onClose hook error:', error);
            }
        }

        // Run handler
        if (route.handlers.close) {
            try {
                await route.handlers.close(burgerWs, code, reason);
            } catch (error) {
                console.error('[WebSocket] close handler error:', error);
            }
        }

        // Connection is gone — drop the cached context.
        this.wsContexts.delete(ws);
    }

    private async handleDrain(ws: any): Promise<void> {
        const route = this.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = this.createBurgerWS(ws);

        if (route.handlers.drain) {
            try {
                await route.handlers.drain(burgerWs);
            } catch (error) {
                console.error('[WebSocket] drain handler error:', error);
            }
        }
    }

    private async handlePing(ws: any): Promise<void> {
        const route = this.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = this.createBurgerWS(ws);

        if (route.handlers.ping) {
            try {
                await route.handlers.ping(burgerWs);
            } catch (error) {
                console.error('[WebSocket] ping handler error:', error);
            }
        }
    }

    private async handlePong(ws: any): Promise<void> {
        const route = this.getRouteFromWs(ws);
        if (!route) return;

        const burgerWs = this.createBurgerWS(ws);

        if (route.handlers.pong) {
            try {
                await route.handlers.pong(burgerWs);
            } catch (error) {
                console.error('[WebSocket] pong handler error:', error);
            }
        }
    }

    /**
     * Create the fetch handler for WebSocket upgrade
     */
    createFetchHandler() {
        const self = this;

        return async (
            request: Request,
            // Platform boundary: the upgrade `server` handle is Bun's
            // `Server` (Bun.serve return). Core stays WinterCG-pure, so the
            // type is intentionally opaque here and only used structurally
            // (calls `server.upgrade(...)`) by the Bun adapter at runtime.
            server: any
        ): Promise<Response | undefined> => {
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
                return new Response('WebSocket route not found', {
                    status: 404,
                });
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
     * Create (or reuse) the BurgerWS context for a connection.
     * One context per connection: `ws.data` mutations made in `open`
     * (or any handler) persist into `message`/`close`.
     */
    private createBurgerWS(ws: any): BurgerWS {
        let burgerWs = this.wsContexts.get(ws);
        if (!burgerWs) {
            burgerWs = new BurgerWSContext(ws, this.providers);
            this.wsContexts.set(ws, burgerWs);
        }
        return burgerWs;
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
        if (
            !this.pluginTransform &&
            (!this.pluginBeforeRoute || this.pluginBeforeRoute.length === 0)
        ) {
            return {};
        }

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

            // Always run beforeRoute hooks — plugins decide for themselves
            // whether to act (e.g. rate limiting). Only the required-user
            // check below is gated on auth being enabled for the route.
            if (this.pluginBeforeRoute) {
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

            const authConfig =
                routeConfig?.auth !== undefined &&
                typeof routeConfig.auth === 'object'
                    ? routeConfig.auth
                    : undefined;

            // If auth is required but no user was attached, reject
            if (authConfig?.required && !user) {
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
                            headers: {
                                'Content-Type': 'application/problem+json',
                            },
                        }
                    ),
                };
            }

            // If the route declares roles, the authenticated user must hold
            // at least one of them — otherwise reject with 403.
            if (authConfig?.roles && authConfig.roles.length > 0) {
                if (!hasAnyRole(user, authConfig.roles)) {
                    return {
                        response: new Response(
                            JSON.stringify({
                                type: 'https://burger-api.com/errors/forbidden',
                                title: 'Forbidden',
                                status: 403,
                                detail: 'Insufficient permissions',
                            }),
                            {
                                status: 403,
                                headers: {
                                    'Content-Type': 'application/problem+json',
                                },
                            }
                        ),
                    };
                }
            }

            return { user };
        } catch (error) {
            // Auth hook threw an error — determine correct status
            if (this.debug) {
                console.error('[WebSocket] Auth hook error:', error);
            }
            const status = (error as any)?.status ?? 401;
            const title = status === 403 ? 'Forbidden' : 'Unauthorized';
            const type =
                status === 403
                    ? 'https://burger-api.com/errors/forbidden'
                    : 'https://burger-api.com/errors/unauthorized';
            return {
                response: new Response(
                    JSON.stringify({
                        type,
                        title,
                        status,
                        detail:
                            error instanceof Error
                                ? error.message
                                : 'Authentication failed',
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

/**
 * Checks whether an authenticated user holds at least one of the required
 * roles. Supports three shapes: a plain role string, an array of roles, or
 * an object with a `roles` array (e.g. JWT payloads).
 */
function hasAnyRole(
    user: unknown,
    required: string[]
): boolean {
    if (user === null || user === undefined) return false;
    if (typeof user === 'string') {
        return required.includes(user);
    }
    if (Array.isArray(user)) {
        return user.some((role) => required.includes(role));
    }
    if (typeof user === 'object') {
        const roles = (user as Record<string, unknown>).roles;
        if (Array.isArray(roles)) {
            return roles.some((role) => required.includes(role));
        }
    }
    return false;
}
