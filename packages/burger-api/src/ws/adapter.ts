/**
 * WebSocket adapter
 * Integrates WebSocket router with Bun.serve()
 */

import type { WebSocketRouter } from './router.js';
import type {
    CompiledWebSocketRoute,
    BurgerWS,
    WebSocketConfig,
} from './types.js';
import { BurgerWSContext } from './types.js';
import { BurgerContext } from '../context/context.js';
import type {
    BurgerEnv,
    BurgerExecutionContext,
} from '../context/context.js';
import type { TransformMap } from '../lifecycle/types.js';
import { applyTransform } from '../lifecycle/transform.js';
import {
    acceptWsUpgrade,
    detectWsPlatform,
    normalizeWsMessage,
    type NodeWsBridge,
    type NodeWsBridgeOptions,
    type WsEventSink,
    type WsUpgradeOutcome,
} from './platform.js';

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
     * Handles a possibly-WebSocket request.
     *
     * This is THE entry point for WebSocket handling on every runtime. It
     * detects the platform, matches the route, runs the auth gate, performs
     * the protocol handoff, and returns an explicit outcome so callers can
     * never confuse "not an upgrade" with "socket taken over" (the legacy
     * `undefined`-on-success signal that caused post-upgrade HTTP
     * fall-through).
     *
     * @param request incoming request (upgrade or normal)
     * @param server Bun serve handle when running under `Bun.serve`
     * @param env platform bindings (bound onto the temporary auth context)
     */
    async handleUpgrade(
        request: Request,
        server?: unknown,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): Promise<WsUpgradeOutcome> {
        const upgradeHeader = request.headers.get('upgrade');
        if (upgradeHeader?.toLowerCase() !== 'websocket') {
            return { handled: false };
        }

        // Extract path from URL and match against the WS router
        const url = new URL(request.url);
        const match = this.router.match(url.pathname);
        if (!match) {
            return {
                handled: true,
                response: new Response('WebSocket route not found', {
                    status: 404,
                }),
            };
        }

        // Run auth hooks before upgrade
        const routeConfig = match.route.config;
        const authResult = await this.runAuthHooks(
            request,
            routeConfig,
            env,
            executionCtx
        );
        if (authResult.response) {
            return { handled: true, response: authResult.response };
        }

        // Attach matched route with resolved params and user to the socket
        const upgradeData: Record<string, unknown> = {
            route: { ...match.route, params: match.params },
        };
        if (authResult.user !== undefined) {
            upgradeData.user = authResult.user;
        }

        const platform = detectWsPlatform(server);
        if (platform === 'node') {
            return this.nodeFetchUpgradeUnsupported();
        }

        const response = acceptWsUpgrade({
            platform,
            request,
            server,
            data: upgradeData,
            events: this.eventSink(),
        });
        return { handled: true, response };
    }

    /**
     * Node cannot complete a WebSocket handshake inside a fetch handler —
     * surface an explicit 501 with remediation instead of a thrown error.
     */
    private nodeFetchUpgradeUnsupported(): WsUpgradeOutcome {
        return {
            handled: true,
            response: new Response(
                'WebSocket upgrades on Node require burger.createNodeWsBridge(...) ' +
                    "wired to node:http's 'upgrade' event.",
                { status: 501 }
            ),
        };
    }

    /** Shared event sink pushed into by non-Bun platforms. */
    private eventSink(): WsEventSink {
        return {
            onOpen: (raw) => this.handleOpen(raw),
            onMessage: (raw, message) => this.handleMessage(raw, message),
            onClose: (raw, code, reason) =>
                this.handleClose(raw, code, reason),
        };
    }

    /**
     * Legacy fetch-shaped wrapper around {@link handleUpgrade}.
     *
     * Returns `undefined` for BOTH "not an upgrade" and "Bun took over the
     * socket" — callers needing the distinction must use `handleUpgrade`.
     * Kept for backward compatibility with existing integrations.
     *
     * Prefer {@link handleUpgrade} directly for any new integration: it
     * returns a discriminated `{ handled: false }` / `{ handled: true,
     * response }` outcome, so the ambiguity this wrapper carries never
     * arises.
     */
    createFetchHandler() {
        return async (
            request: Request,
            server?: unknown
        ): Promise<Response | undefined> => {
            const outcome = await this.handleUpgrade(request, server);
            return outcome.handled ? outcome.response : undefined;
        };
    }

    /**
     * Node integration: bridges node:http's `'upgrade'` event into the
     * framework pipeline using a framing library's `WebSocketServer`
     * (e.g. the `ws` package) — Node has no fetch-native WebSocket upgrade.
     *
     * ```ts
     * import http from 'node:http';
     * import { WebSocketServer } from 'ws';
     * import { Burger, toFetchHandler } from 'burger-api';
     *
     * const bridge = burger.createNodeWsBridge({ WebSocketServer });
     * http.createServer((req, res) => toFetchHandler(burger)(req))
     *     .on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head))
     *     .listen(3000);
     * ```
     */
    createNodeWsBridge(options: NodeWsBridgeOptions): NodeWsBridge {
        const wss = new options.WebSocketServer({ noServer: true });
        const adapter = this;
        return {
            async handleUpgrade(req, socket, head): Promise<void> {
                const raw = req as {
                    url?: string;
                    headers: Record<
                        string,
                        string | string[] | undefined
                    >;
                };
                const host = String(raw.headers.host ?? 'localhost');
                const request = new Request(`http://${host}${raw.url ?? '/'}`);
                const outcome = await adapter.handleUpgrade(request);
                if (!outcome.handled || outcome.response) {
                    // Not an upgrade, unmatched route, or auth rejection —
                    // destroy the raw socket; there is no Response channel.
                    (socket as { destroy?(): void }).destroy?.();
                    return;
                }
                wss.handleUpgrade(req, socket, head, (ws) => {
                    ws.on('message', (...args: never[]) => {
                        void adapter.handleMessage(
                            ws,
                            normalizeWsMessage(args[0])
                        );
                    });
                    ws.on('close', (...args: never[]) => {
                        void adapter.handleClose(
                            ws,
                            (args[0] as unknown as number) ?? 1005,
                            (args[1] as unknown as string) ?? ''
                        );
                    });
                    void adapter.handleOpen(ws);
                });
            },
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
     * Platform `env` / `executionCtx` are bound onto the temporary context
     * so transform hooks can read bindings (e.g. JWT secrets from `env`).
     */
    private async runAuthHooks(
        request: Request,
        routeConfig?: WebSocketConfig,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
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
            routeConfig as Record<string, unknown> | undefined,
            env,
            executionCtx
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
