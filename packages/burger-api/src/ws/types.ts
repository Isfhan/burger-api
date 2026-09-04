/**
 * WebSocket types for BurgerAPI
 */

import type { BurgerServices } from '../context/context';

/**
 * Per-connection data structure
 * Extends this via module augmentation:
 *
 * @example
 * ```typescript
 * declare module "burger-api" {
 * interface WebSocketData {
 * userId: string;
 * username: string;
 * }
 * }
 * ```
 */
export interface WebSocketData {}

/**
 * WebSocket connection states
 */
export const enum WebSocketReadyState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3,
}

/**
 * WebSocket close codes
 */
export const enum WebSocketCloseCode {
    NORMAL_CLOSURE = 1000,
    GOING_AWAY = 1001,
    PROTOCOL_ERROR = 1002,
    UNSUPPORTED_DATA = 1003,
    NO_STATUS_RECEIVED = 1005,
    ABNORMAL_CLOSURE = 1006,
    INVALID_FRAME_PAYLOAD_DATA = 1007,
    POLICY_VIOLATION = 1008,
    MESSAGE_TOO_BIG = 1009,
    MANDATORY_EXTENSION = 1010,
    INTERNAL_ERROR = 1011,
    SERVICE_RESTART = 1012,
    TRY_AGAIN_LATER = 1013,
    BAD_GATEWAY = 1014,
}

/**
 * WebSocket configuration options
 */
export interface WebSocketConfig {
    /**
     * Maximum length of incoming message in bytes (default: 1024 * 1024 = 1MB)
     */
    maxPayloadLength?: number;

    /**
     * Idle timeout in seconds (default: 30)
     */
    idleTimeout?: number;

    /**
     * Backpressure limit in bytes (default: 1024 * 1024 = 1MB)
     */
    backpressureLimit?: number;

    /**
     * Close connection when backpressure limit reached (default: false)
     */
    closeOnBackpressureLimit?: boolean;

    /**
     * Require server per-message compression (default: false)
     */
    compression?: boolean;

    /**
     * Auth configuration. Set to `false` to disable auth for this route.
     */
    auth?:
        | false
        | {
              required?: boolean;
              roles?: string[];
          };
}

/**
 * WebSocket route definition
 */
export interface WebSocketRouteDefinition {
    /**
     * Route path (e.g., "/chat", "/notifications/:room")
     */
    path: string;

    /**
     * Route parameters
     */
    params?: Record<string, string>;

    /**
     * Handler functions
     */
    handlers: WebSocketHandlers;

    /**
     * Route hooks
     */
    hooks?: WebSocketHooks;

    /**
     * Route configuration
     */
    config?: WebSocketConfig;
}

/**
 * WebSocket handler functions
 */
export interface WebSocketHandlers {
    open?: (ws: BurgerWS) => void | Promise<void>;
    message?: (ws: BurgerWS, message: string | Buffer) => void | Promise<void>;
    close?: (
        ws: BurgerWS,
        code: number,
        reason: string
    ) => void | Promise<void>;
    drain?: (ws: BurgerWS) => void | Promise<void>;
    ping?: (ws: BurgerWS) => void | Promise<void>;
    pong?: (ws: BurgerWS) => void | Promise<void>;
}

/**
 * WebSocket hook functions
 */
export interface WebSocketHooks {
    onOpen?: (ws: BurgerWS) => void | Promise<void>;
    onMessage?: (
        ws: BurgerWS,
        message: string | Buffer
    ) => void | Promise<void>;
    onClose?: (
        ws: BurgerWS,
        code: number,
        reason: string
    ) => void | Promise<void>;
}

/**
 * Compiled WebSocket route
 */
export interface CompiledWebSocketRoute {
    /**
     * Route path
     */
    path: string;

    /**
     * Route parameters
     */
    params?: Record<string, string>;

    /**
     * Compiled handlers
     */
    handlers: WebSocketHandlers;

    /**
     * Compiled hooks
     */
    hooks?: WebSocketHooks;

    /**
     * Merged configuration
     */
    config: WebSocketConfig;
}

/**
 * WebSocket context interface
 * Provides connection methods and data access
 */
export interface BurgerWS {
    /**
     * Per-connection data. Typed via module augmentation of `WebSocketData`:
     *
     * ```typescript
     * declare module "burger-api" {
     * interface WebSocketData {
     * userId: string;
     * username: string;
     * }
     * }
     * ```
     */
    data: WebSocketData;

    /**
     * Injected application services (same as `ctx.services` in HTTP handlers).
     * Populated by `burger.provide()`. Typed via module augmentation of `BurgerServices`.
     *
     * @example
     * ```typescript
     * const db = ws.services.db;
     * const logger = ws.services.logger;
     * ```
     */
    services: BurgerServices;

    /**
     * Authenticated user from auth plugins (same as `ctx.user` in HTTP handlers).
     * Available when auth plugins are registered and auth succeeds during upgrade.
     *
     * @example
     * ```typescript
     * export function open(ws: BurgerWS) {
     * const user = ws.user as JwtPayload;
     * console.log(`User connected: ${user.sub}`);
     * }
     * ```
     */
    user?: unknown;

    /**
     * Send a message to the client
     */
    send(message: string | Buffer): void;

    /**
     * Send a text message to the client
     */
    sendText(message: string): void;

    /**
     * Send a binary message to the client
     */
    sendBinary(message: Buffer): void;

    /**
     * Subscribe to a topic for pub/sub
     */
    subscribe(topic: string): void;

    /**
     * Unsubscribe from a topic
     */
    unsubscribe(topic: string): void;

    /**
     * Publish a message to all subscribers of a topic
     */
    publish(topic: string, message: string | Buffer): void;

    /**
     * Publish a text message to all subscribers of a topic
     */
    publishText(topic: string, message: string): void;

    /**
     * Publish a binary message to all subscribers of a topic
     */
    publishBinary(topic: string, message: Buffer): void;

    /**
     * Check if connected to a topic
     */
    isSubscribed(topic: string): boolean;

    /**
     * Remote IP address
     */
    remoteAddress: string;

    /**
     * Connection ready state
     */
    readyState: WebSocketReadyState;

    /**
     * Terminate the connection immediately
     */
    terminate(): void;

    /**
     * Close the connection with code and reason
     */
    close(code?: number, reason?: string): void;

    /**
     * Batch messages for efficiency
     */
    cork(callback: () => void): void;

    /**
     * The underlying raw Bun ServerWebSocket (advanced use)
     */
    readonly raw: unknown;
}

/**
 * WebSocket module definition for a route
 */
export interface WebSocketModule {
    /**
     * Connection opened handler
     */
    open?: (ws: BurgerWS) => void | Promise<void>;

    /**
     * Message received handler
     */
    message?: (ws: BurgerWS, message: string | Buffer) => void | Promise<void>;

    /**
     * Connection closed handler
     */
    close?: (
        ws: BurgerWS,
        code: number,
        reason: string
    ) => void | Promise<void>;

    /**
     * Backpressure relieved handler
     */
    drain?: (ws: BurgerWS) => void | Promise<void>;

    /**
     * Ping received handler
     */
    ping?: (ws: BurgerWS) => void | Promise<void>;

    /**
     * Pong received handler
     */
    pong?: (ws: BurgerWS) => void | Promise<void>;
}

/**
 * WebSocket hooks module
 */
export interface WebSocketHooksModule {
    /**
     * Hook runs when connection opens
     */
    onOpen?: (ws: BurgerWS) => void | Promise<void>;

    /**
     * Hook runs when message received
     */
    onMessage?: (
        ws: BurgerWS,
        message: string | Buffer
    ) => void | Promise<void>;

    /**
     * Hook runs when connection closes
     */
    onClose?: (
        ws: BurgerWS,
        code: number,
        reason: string
    ) => void | Promise<void>;
}

/**
 * WebSocket config module
 */
export interface WebSocketConfigModule extends WebSocketConfig {}

/**
 * BurgerWS implementation that wraps Bun's ServerWebSocket
 */
export class BurgerWSContext implements BurgerWS {
    // Platform boundary: wraps the runtime's native server-side socket —
    // Bun's `ServerWebSocket`, a Cloudflare/Deno `WebSocket`, or a `ws`
    // WebSocket on Node. Core stays runtime-pure: every method probes the
    // raw socket structurally and degrades loudly where a capability
    // genuinely does not exist (e.g. pub/sub off Bun).
    private _raw: any;
    private _data: WebSocketData = {};
    private _services: BurgerServices = Object.create(null) as BurgerServices;

    // The raw socket is the platform's server-side WebSocket (see `_raw`
    // above); the provider map mirrors `BurgerContext.create`'s providers
    // parameter.
    constructor(rawWebSocket: any, providers?: Map<string, unknown>) {
        this._raw = rawWebSocket;
        // Copy data from raw WebSocket (typed via the WebSocketData
        // augmentation interface users extend).
        if (rawWebSocket.data) {
            this._data = { ...rawWebSocket.data } as WebSocketData;
        }
        // Inject providers as services
        this._services = providers
            ? (Object.fromEntries(providers) as unknown as BurgerServices)
            : (Object.create(null) as BurgerServices);
    }

    get data(): WebSocketData {
        return this._data;
    }

    set data(value: WebSocketData) {
        this._data = value;
        // Sync back to raw WebSocket
        if (this._raw) {
            this._raw.data = value;
        }
    }

    get services(): BurgerServices {
        return this._services;
    }

    get user(): unknown {
        // `user` is not declared on WebSocketData (auth plugins seed it);
        // access through the widened record.
        return (this._data as Record<string, unknown>).user;
    }

    send(message: string | Buffer): void {
        if (typeof this._raw.sendText === 'function') {
            // Bun socket: dedicated text/binary entry points.
            if (typeof message === 'string') {
                this._raw.sendText(message);
            } else {
                this._raw.sendBinary(message);
            }
            return;
        }
        // Standard WebSocket (Cloudflare / Deno / ws): `send` accepts
        // strings and binary views.
        this._raw.send(
            typeof message === 'string'
                ? message
                : new Uint8Array(
                      message.buffer,
                      message.byteOffset,
                      message.byteLength
                  )
        );
    }

    sendText(message: string): void {
        if (typeof this._raw.sendText === 'function') {
            this._raw.sendText(message);
            return;
        }
        this._raw.send(message);
    }

    sendBinary(message: Buffer): void {
        if (typeof this._raw.sendBinary === 'function') {
            this._raw.sendBinary(message);
            return;
        }
        this._raw.send(
            new Uint8Array(
                message.buffer,
                message.byteOffset,
                message.byteLength
            )
        );
    }

    subscribe(topic: string): void {
        this.requireBun('subscribe', topic);
        this._raw.subscribe(topic);
    }

    unsubscribe(topic: string): void {
        this.requireBun('unsubscribe', topic);
        this._raw.unsubscribe(topic);
    }

    publish(topic: string, message: string | Buffer): void {
        this.requireBun('publish', topic);
        if (typeof message === 'string') {
            this._raw.publishText(topic, message);
        } else {
            this._raw.publishBinary(topic, message);
        }
    }

    publishText(topic: string, message: string): void {
        this.requireBun('publish', topic);
        this._raw.publishText(topic, message);
    }

    publishBinary(topic: string, message: Buffer): void {
        this.requireBun('publish', topic);
        this._raw.publishBinary(topic, message);
    }

    isSubscribed(topic: string): boolean {
        if (typeof this._raw.isSubscribed !== 'function') {
            throw new Error(
                '[burger-api] ws.isSubscribed() requires Bun topic pub/sub, ' +
                    'which this runtime does not provide.'
            );
        }
        return this._raw.isSubscribed(topic);
    }

    get remoteAddress(): string {
        return this._raw.remoteAddress ?? '';
    }

    get readyState(): WebSocketReadyState {
        // Standard WebSockets (CF/Deno/ws) expose the same numeric states.
        return this._raw.readyState ?? WebSocketReadyState.OPEN;
    }

    terminate(): void {
        if (typeof this._raw.terminate !== 'function') {
            this._raw.close(1001, 'Going Away');
            return;
        }
        this._raw.terminate();
    }

    close(code?: number, reason?: string): void {
        this._raw.close(code, reason);
    }

    cork(callback: () => void): void {
        if (typeof this._raw.cork !== 'function') {
            // No batching on this runtime — run directly.
            callback();
            return;
        }
        this._raw.cork(callback);
    }

    get raw(): unknown {
        return this._raw;
    }

    /**
     * Fails loud for capabilities that only exist on Bun's socket
     * (topic pub/sub, batched cork). A silent no-op would hide real
     * delivery failures from application code.
     */
    private requireBun(method: string, topic?: string): void {
        const available =
            typeof this._raw.subscribe === 'function' &&
            typeof this._raw.publishText === 'function';
        if (available) return;
        throw new Error(
            `[burger-api] ws.${method}(${topic ? `"${topic}"` : ''}) requires ` +
                'Bun topic pub/sub, which this runtime does not provide. ' +
                'Track per-connection state in ws.data and fan out with an ' +
                'explicit connection registry instead.'
        );
    }
}
