/**
 * WebSocket types for BurgerAPI
 */

/**
 * Per-connection data structure
 * Extends this via module augmentation:
 *
 * @example
 * ```typescript
 * declare module "burger-api" {
 *   interface WebSocketData {
 *     userId: string;
 *     username: string;
 *   }
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
   * Auth configuration
   */
  auth?: {
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
  close?: (ws: BurgerWS, code: number, reason: string) => void | Promise<void>;
  drain?: (ws: BurgerWS) => void | Promise<void>;
  ping?: (ws: BurgerWS) => void | Promise<void>;
  pong?: (ws: BurgerWS) => void | Promise<void>;
}

/**
 * WebSocket hook functions
 */
export interface WebSocketHooks {
  onOpen?: (ws: BurgerWS) => void | Promise<void>;
  onMessage?: (ws: BurgerWS, message: string | Buffer) => void | Promise<void>;
  onClose?: (ws: BurgerWS, code: number, reason: string) => void | Promise<void>;
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
   * Per-connection data
   */
  data: Record<string, unknown>;

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
  services: Record<string, unknown>;

  /**
   * Authenticated user from auth plugins (same as `ctx.user` in HTTP handlers).
   * Available when auth plugins are registered and auth succeeds during upgrade.
   *
   * @example
   * ```typescript
   * export function open(ws: BurgerWS) {
   *   const user = ws.user as JwtPayload;
   *   console.log(`User connected: ${user.sub}`);
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
  close?: (ws: BurgerWS, code: number, reason: string) => void | Promise<void>;

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
  onMessage?: (ws: BurgerWS, message: string | Buffer) => void | Promise<void>;

  /**
   * Hook runs when connection closes
   */
  onClose?: (ws: BurgerWS, code: number, reason: string) => void | Promise<void>;
}

/**
 * WebSocket config module
 */
export interface WebSocketConfigModule extends WebSocketConfig {}

/**
 * BurgerWS implementation that wraps Bun's ServerWebSocket
 */
export class BurgerWSContext implements BurgerWS {
  private _raw: any;
  private _data: Record<string, unknown> = {};
  private _services: Record<string, unknown> = {};

  constructor(rawWebSocket: any, providers?: Map<string, unknown>) {
    this._raw = rawWebSocket;
    // Copy data from raw WebSocket
    if (rawWebSocket.data) {
      this._data = { ...rawWebSocket.data };
    }
    // Inject providers as services
    this._services = providers ? Object.fromEntries(providers) : {};
  }

  get data(): Record<string, unknown> {
    return this._data;
  }

  set data(value: Record<string, unknown>) {
    this._data = value;
    // Sync back to raw WebSocket
    if (this._raw) {
      this._raw.data = value;
    }
  }

  get services(): Record<string, unknown> {
    return this._services;
  }

  get user(): unknown {
    return this._data.user;
  }

  send(message: string | Buffer): void {
    if (typeof message === 'string') {
      this._raw.sendText(message);
    } else {
      this._raw.sendBinary(message);
    }
  }

  sendText(message: string): void {
    this._raw.sendText(message);
  }

  sendBinary(message: Buffer): void {
    this._raw.sendBinary(message);
  }

  subscribe(topic: string): void {
    this._raw.subscribe(topic);
  }

  unsubscribe(topic: string): void {
    this._raw.unsubscribe(topic);
  }

  publish(topic: string, message: string | Buffer): void {
    if (typeof message === 'string') {
      this._raw.publishText(topic, message);
    } else {
      this._raw.publishBinary(topic, message);
    }
  }

  publishText(topic: string, message: string): void {
    this._raw.publishText(topic, message);
  }

  publishBinary(topic: string, message: Buffer): void {
    this._raw.publishBinary(topic, message);
  }

  isSubscribed(topic: string): boolean {
    return this._raw.isSubscribed(topic);
  }

  get remoteAddress(): string {
    return this._raw.remoteAddress;
  }

  get readyState(): WebSocketReadyState {
    return this._raw.readyState;
  }

  terminate(): void {
    this._raw.terminate();
  }

  close(code?: number, reason?: string): void {
    this._raw.close(code, reason);
  }

  cork(callback: () => void): void {
    this._raw.cork(callback);
  }

  get raw(): unknown {
    return this._raw;
  }
}
