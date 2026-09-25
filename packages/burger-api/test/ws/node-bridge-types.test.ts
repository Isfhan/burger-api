/**
 * Regression coverage for `burger.createNodeWsBridge({ WebSocketServer })`,
 * found while building a real Node WebSocket example project. Five
 * separate bugs made the documented pattern (`docs/websocket/overview.md`'s
 * Node.js section, and the JSDoc on `Burger.createNodeWsBridge` /
 * `WebSocketAdapter.createNodeWsBridge`) non-functional end to end — there
 * was no existing test at all for this path before this file:
 *
 * 1. **Type mismatch.** `ws`'s real `WebSocket.on('close', (code: number,
 *    reason: Buffer) => ...)` has concretely-typed listener parameters, but
 *    `NodeWsLike.on`'s listener type was `(...args: never[]) => void` — a
 *    function with real parameter types can never satisfy a `never[]`-rest
 *    listener. Fixed by widening to `any[]` in `src/ws/platform.ts` (this
 *    interface only describes what the framework calls `.on()` with, never
 *    what it reads back out).
 * 2. **No headers on the synthetic Request.** The bridge built
 *    `new Request(url)` with no headers at all, so its own `Upgrade:
 *    websocket` check always failed and every real upgrade got its socket
 *    destroyed immediately.
 * 3. **Wrong routing even with headers fixed.** The bridge called the
 *    shared `handleUpgrade()`, which always runs `detectWsPlatform()` and
 *    — with no Bun/Cloudflare/Deno platform object present, which is
 *    always true under Node — falls back to `'node'` and returns an
 *    unconditional 501. Fixed by extracting the route-match+auth logic into
 *    `matchAndAuthorize()`, shared by both paths, with the Node path
 *    bypassing platform detection entirely (Node's handoff happens via the
 *    framing library's own `handleUpgrade`, not `acceptWsUpgrade`).
 * 4. **`ws.data` never attached.** `getRouteFromWs()` reads `ws.data?.route`
 *    — Bun sets this natively via `server.upgrade(request, { data })`, but
 *    nothing set it on the real socket handed back by `wss.handleUpgrade`,
 *    so `open`/`message`/`close` would all silently no-op even after a
 *    successful handshake.
 * 5. **Text frames arrived as `Buffer`, not `string`.** `ws`'s `'message'`
 *    event always hands a Node `Buffer` — for text *and* binary frames
 *    alike — with a separate `isBinary` flag; `normalizeWsMessage()`
 *    ignored that flag, so every message (including plain text) reached
 *    handlers as a raw `Buffer`, unlike Bun's native `ServerWebSocket`
 *    (`string` for text frames). Found by actually running two WebSocket
 *    clients against the bridge and broadcasting a message. Fixed by
 *    passing `isBinary` through to `normalizeWsMessage()` and decoding as
 *    UTF-8 when it's `false`.
 *
 * The fake below reproduces `ws`'s real shape (including its
 * concretely-typed overloads, for bug 1) and lets the test trigger
 * `message`/`close` the same way a real socket would, rather than adding
 * `ws` as a dependency.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';

type Listener = (...args: any[]) => void;

class FakeWebSocket {
    private listeners = new Map<string, Listener[]>();
    data?: unknown;

    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'message', listener: (data: Buffer, isBinary: boolean) => void): this;
    on(event: string, listener: Listener): this {
        const list = this.listeners.get(event) ?? [];
        list.push(listener);
        this.listeners.set(event, list);
        return this;
    }

    emit(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners.get(event) ?? []) {
            listener(...args);
        }
    }
}

/**
 * Structurally mirrors `ws`'s `WebSocketServer` in `{ noServer: true }`
 * mode. Every constructed instance is recorded in `instances` (the test
 * only holds a *constructor* reference via `NodeWsBridgeOptions`, never the
 * instance itself, so this is how the test reaches the resulting socket).
 */
class FakeWebSocketServer {
    static instances: FakeWebSocketServer[] = [];
    lastSocket: FakeWebSocket | null = null;

    constructor(_opts: { noServer: true }) {
        FakeWebSocketServer.instances.push(this);
    }

    handleUpgrade(
        _req: unknown,
        _socket: unknown,
        _head: unknown,
        callback: (ws: FakeWebSocket) => void
    ): void {
        const ws = new FakeWebSocket();
        this.lastSocket = ws;
        callback(ws);
    }
}

function fakeUpgradeRequest(url: string) {
    return {
        url,
        headers: {
            host: 'localhost',
            upgrade: 'websocket',
            connection: 'Upgrade',
        },
    };
}

describe('createNodeWsBridge against a real framing-library WebSocketServer shape', () => {
    it('compiles against concretely-typed on() listener overloads (bug 1)', async () => {
        const app = new Burger({
            apiRoutes: [],
            wsRoutes: [{ path: '/chat', handlers: { open: () => {} } }],
        });
        await app.fetchHandler();

        // The line below is bug 1's regression check: this must compile.
        const bridge = app.createNodeWsBridge({
            WebSocketServer: FakeWebSocketServer,
        });
        expect(typeof bridge.handleUpgrade).toBe('function');
    });

    it('completes the handshake and delivers open/message/close (bugs 2-4)', async () => {
        let openCount = 0;
        const receivedMessages: (string | Buffer)[] = [];
        const closeResult: {
            value: { code: number; reason: string } | null;
        } = { value: null };

        const app = new Burger({
            apiRoutes: [],
            wsRoutes: [
                {
                    path: '/chat',
                    handlers: {
                        open: () => {
                            openCount++;
                        },
                        message: (_ws, message) => {
                            receivedMessages.push(message);
                        },
                        close: (_ws, code, reason) => {
                            closeResult.value = { code, reason };
                        },
                    },
                },
            ],
        });
        await app.fetchHandler();

        const bridge = app.createNodeWsBridge({
            WebSocketServer: FakeWebSocketServer,
        });

        let destroyed = false;
        const fakeSocket = { destroy: () => (destroyed = true) };
        await bridge.handleUpgrade(
            fakeUpgradeRequest('/chat'),
            fakeSocket,
            Buffer.alloc(0)
        );

        // Bugs 2/3: with the fix, a real upgrade request no longer gets its
        // socket destroyed, and the framing library's handleUpgrade fires.
        expect(destroyed).toBe(false);
        expect(openCount).toBe(1);

        const wsInstance =
            FakeWebSocketServer.instances[
                FakeWebSocketServer.instances.length - 1
            ]?.lastSocket;
        expect(wsInstance).not.toBeNull();

        // Bug 4: ws.data must carry the matched route, or these would
        // silently no-op (getRouteFromWs would return null).
        //
        // `ws`'s real 'message' event always hands a Buffer — for text
        // frames too, with `isBinary: false` distinguishing them — never a
        // plain string. Emitting a string here (instead of a Buffer) would
        // hide bug 5 entirely, since normalizeWsMessage's `typeof data ===
        // 'string'` branch returns strings unchanged regardless of
        // `isBinary`.
        wsInstance!.emit(
            'message',
            Buffer.from('hello from a real socket', 'utf-8'),
            false
        );
        wsInstance!.emit('close', 1000, 'bye');

        // Bug 5: a text frame (isBinary: false) must decode to a string,
        // not pass through as a raw Buffer — Bun's native ServerWebSocket
        // delivers text frames as `string`, so the Node bridge must match.
        expect(receivedMessages).toEqual(['hello from a real socket']);
        expect(typeof receivedMessages[0]).toBe('string');
        expect(closeResult.value).toEqual({ code: 1000, reason: 'bye' });
    });

    it('destroys the socket for a non-upgrade or unmatched-route request', async () => {
        const app = new Burger({
            apiRoutes: [],
            wsRoutes: [{ path: '/chat', handlers: { open: () => {} } }],
        });
        await app.fetchHandler();
        const bridge = app.createNodeWsBridge({
            WebSocketServer: FakeWebSocketServer,
        });

        let destroyed = false;
        const fakeSocket = { destroy: () => (destroyed = true) };
        // No `upgrade` header — must be rejected, not routed.
        await bridge.handleUpgrade(
            { url: '/chat', headers: { host: 'localhost' } },
            fakeSocket,
            Buffer.alloc(0)
        );
        expect(destroyed).toBe(true);

        destroyed = false;
        await bridge.handleUpgrade(
            fakeUpgradeRequest('/no-such-route'),
            fakeSocket,
            Buffer.alloc(0)
        );
        expect(destroyed).toBe(true);
    });
});
