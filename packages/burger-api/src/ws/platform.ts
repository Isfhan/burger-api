/**
 * WebSocket platform seam. Each runtime has its own upgrade primitive (Bun's
 * `server.upgrade`, Cloudflare's `WebSocketPair`, Deno's `upgradeWebSocket`,
 * Node's `'upgrade'` event); {@link detectWsPlatform} and
 * {@link acceptWsUpgrade} isolate those differences.
 *
 * Core stays free of Bun/platform imports: platform objects are reached
 * structurally through `globalThis`.
 */

/**
 * Result of an upgrade attempt:
 * - `{ handled: false }` — not an upgrade; run the normal HTTP pipeline.
 * - `{ handled: true, response }` — the request was consumed. `response` is
 *   `undefined` when the runtime took over the socket directly (Bun);
 *   callers must NOT fall through to HTTP.
 */
export type WsUpgradeOutcome =
    | { handled: false }
    | { handled: true; response?: Response };

/** Shared event sink the platforms push socket events into. */
export interface WsEventSink {
    onOpen(raw: unknown): void | Promise<void>;
    onMessage(raw: unknown, message: string | Buffer): void | Promise<void>;
    onClose(raw: unknown, code: number, reason: string): void | Promise<void>;
}

export type WsPlatformName = 'bun' | 'cloudflare' | 'deno' | 'node';

/**
 * Minimal shape of a framing-library socket on Node (`ws` package).
 *
 * `listener` is `(...args: any[]) => void` on purpose: `ws` declares concrete
 * parameter types, which a rest-`never[]` listener would reject.
 */
export interface NodeWsLike {
    on(
        event: 'message' | 'close',
        listener: (...args: any[]) => void
    ): void;
}

/** Minimal shape of a framing-library `WebSocketServer` in no-server mode. */
export interface NodeWebSocketServerLike {
    handleUpgrade(
        req: unknown,
        socket: unknown,
        head: unknown,
        cb: (ws: NodeWsLike) => void
    ): void;
}

export interface NodeWsBridgeOptions {
    WebSocketServer: new (opts: { noServer: true }) => NodeWebSocketServerLike;
}

export interface NodeWsBridge {
    handleUpgrade(
        req: unknown,
        socket: unknown,
        head: unknown
    ): Promise<void>;
}

/**
 * Detects the WebSocket-capable runtime: an explicit Bun `server` handle wins,
 * otherwise well-known globals are probed.
 */
export function detectWsPlatform(server?: unknown): WsPlatformName {
    if (
        server &&
        typeof (server as Record<string, unknown>).upgrade === 'function'
    ) {
        return 'bun';
    }
    const g = globalThis as Record<string, unknown>;
    if (typeof g.WebSocketPair !== 'undefined') return 'cloudflare';
    const deno = g.Deno as
        | { upgradeWebSocket?: unknown }
        | undefined;
    if (deno && typeof deno.upgradeWebSocket === 'function') return 'deno';
    return 'node';
}

interface WebSocketPairLike {
    0: unknown; // server side — accept() + event listeners
    1: unknown; // client side — returned to the runtime in the 101 response
}

interface DenoUpgradeResult {
    response: Response;
    socket: {
        addEventListener(
            type: string,
            listener: (event: {
                data?: unknown;
                code?: number;
                reason?: string;
            }) => void
        ): void;
    };
}

/**
 * Performs the platform handoff for a matched + authorized upgrade request.
 *
 * @param platform detected runtime
 * @param request the original upgrade Request
 * @param server Bun serve handle (`platform === 'bun'` requires it)
 * @param data per-connection payload attached to the socket (route/params/user)
 * @param events shared event sink wired for push-style runtimes
 * @returns the protocol Response where the platform produces one; `undefined`
 *          when the runtime took over the socket directly (Bun)
 */
export function acceptWsUpgrade(options: {
    platform: WsPlatformName;
    request: Request;
    server?: unknown;
    data: Record<string, unknown>;
    events: WsEventSink;
}): Response | undefined {
    const { platform, request, server, data, events } = options;

    if (platform === 'bun') {
        const upgrade = (
            server as { upgrade?: never } | undefined
        ) as unknown as {
            upgrade: (
                request: Request,
                options: { data: Record<string, unknown> }
            ) => boolean;
        };
        if (typeof upgrade?.upgrade !== 'function') {
            return new Response('WebSocket upgrade failed', { status: 500 });
        }
        // Bun refuses malformed handshakes (e.g. no Sec-WebSocket-Key):
        // a client error, not a server failure.
        if (!upgrade.upgrade(request, { data })) {
            return new Response(
                'Bad Request: invalid WebSocket upgrade request',
                { status: 400 }
            );
        }
        // Socket handed off — the runtime owns the connection from here.
        return undefined;
    }

    if (platform === 'cloudflare') {
        const g = globalThis as Record<string, unknown>;
        const pair = new (g.WebSocketPair as new () => WebSocketPairLike)();
        const serverSide = pair[0] as {
            accept(): void;
            addEventListener(
                type: string,
                listener: (event: {
                    data?: unknown;
                    code?: number;
                    reason?: string;
                }) => void
            ): void;
        };
        wirePushListeners(serverSide, data, events);
        serverSide.accept();
        // `webSocket` is the standard Workers/Deno response member; the
        // base TS lib's ResponseInit does not model it yet.
        return new Response(null, {
            status: 101,
            webSocket: pair[1],
        } as unknown as ResponseInit & { webSocket: unknown } as ResponseInit);
    }

    if (platform === 'deno') {
        const deno = (globalThis as Record<string, unknown>).Deno as {
            upgradeWebSocket: (request: Request) => DenoUpgradeResult;
        };
        const { response, socket } = deno.upgradeWebSocket(request);
        wirePushListeners(socket, data, events);
        return response;
    }

    // Node cannot complete a WebSocket handshake inside a fetch handler —
    // it requires the `'upgrade'` event on node:http plus a framing library.
    throw new Error(
        '[burger-api] WebSocket upgrades are not supported through the ' +
            'fetch entry on Node. Use burger.createNodeWsBridge(...) with a ' +
            "WebSocketServer (e.g. the 'ws' package) wired to node:http's " +
            "'upgrade' event."
    );
}

interface PushSocket {
    accept?(): void;
    addEventListener(
        type: string,
        listener: (event: {
            data?: unknown;
            code?: number;
            reason?: string;
        }) => void
    ): void;
}

function wirePushListeners(
    socket: PushSocket,
    data: Record<string, unknown>,
    events: WsEventSink
): void {
    // Push-style sockets (Workers / Deno) need `data` attached explicitly,
    // or the adapter cannot find the matched route (open/message never fire).
    (socket as PushSocket & { data?: unknown }).data = data;
    socket.addEventListener('open', () => {
        void events.onOpen(socket);
    });
    socket.addEventListener('message', (event) => {
        void events.onMessage(socket, normalizeWsMessage(event.data));
    });
    socket.addEventListener('close', (event) => {
        void events.onClose(socket, event.code ?? 1005, event.reason ?? '');
    });
}

/**
 * Normalizes a socket message to `string` (text) or `Buffer` (binary).
 *
 * `isBinary` matters for `ws`-package callers: its `'message'` event always
 * hands a Node `Buffer` plus a separate `isBinary` flag, so text frames are
 * decoded as UTF-8. Cloudflare/Deno deliver text as `string` already.
 */
export function normalizeWsMessage(
    data: unknown,
    isBinary?: boolean
): string | Buffer {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) {
        return isBinary === false
            ? Buffer.from(data).toString('utf-8')
            : Buffer.from(data);
    }
    if (ArrayBuffer.isView(data)) {
        const buf = Buffer.from(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );
        return isBinary === false ? buf.toString('utf-8') : buf;
    }
    return String(data ?? '');
}
