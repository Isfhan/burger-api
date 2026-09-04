/**
 * WebSocket platform seam.
 *
 * The HTTP pipeline is runtime-agnostic; WebSocket handoff is not — each
 * runtime has its own upgrade primitive (Bun's `server.upgrade`,
 * Cloudflare's `WebSocketPair`, Deno's `upgradeWebSocket`, Node's
 * `'upgrade'` event). This module isolates those differences behind two
 * pieces:
 *
 * 1. {@link detectWsPlatform} — best-effort runtime detection from the
 *    request-time environment (an explicit Bun `server` handle wins).
 * 2. {@link acceptWsUpgrade} — performs the protocol handoff for an
 *    already-matched and already-authorized request, wiring the platform
 *    socket to the shared event callbacks on runtimes that push events
 *    (Cloudflare / Deno) instead of pulling them through a serve-level
 *    option object (Bun).
 *
 * Core stays free of Bun/platform imports: every platform object is reached
 * structurally through `globalThis`, so WinterCG bundles never pull in a
 * runtime they do not run on.
 */

/**
 * Result of an upgrade attempt:
 * - `{ handled: false }` — not a WebSocket upgrade request; caller must run
 *   the normal HTTP pipeline.
 * - `{ handled: true, response }` — the request was consumed by the
 *   WebSocket layer. `response` is the protocol response where the platform
 *   returns one (`101 Switching Protocols` on Cloudflare/Deno, or the 404 /
 *   auth-rejection response). It is `undefined` when the runtime hijacked
 *   the socket itself (Bun) — callers must NOT fall through to HTTP.
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

/** Minimal shape of a framing-library socket on Node (`ws` package). */
export interface NodeWsLike {
    on(
        event: 'message' | 'close',
        listener: (...args: never[]) => void
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
 * Detects the current WebSocket-capable runtime.
 * `server` is the Bun serve handle when available (authoritative); without
 * it, detection falls back to well-known globals.
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
        const upgraded =
            typeof upgrade?.upgrade === 'function' &&
            upgrade.upgrade(request, { data });
        if (!upgraded) {
            return new Response('WebSocket upgrade failed', { status: 500 });
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
        wirePushListeners(serverSide, events);
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
        wirePushListeners(socket, events);
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

function wirePushListeners(socket: PushSocket, events: WsEventSink): void {
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

export function normalizeWsMessage(data: unknown): string | Buffer {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );
    }
    return String(data ?? '');
}
