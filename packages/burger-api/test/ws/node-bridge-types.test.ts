/**
 * Covers `burger.createNodeWsBridge({ WebSocketServer })`: upgrade checks,
 * routing, `ws.data`, message normalization, and socket rejection.
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
 * Fake `WebSocketServer` in `{ noServer: true }` mode. Instances are
 * recorded so tests can reach the socket the bridge creates.
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
    it('compiles against concretely-typed on() listener overloads', async () => {
        const app = new Burger({
            apiRoutes: [],
            wsRoutes: [{ path: '/chat', handlers: { open: () => {} } }],
        });
        await app.fetchHandler();

        // This must compile against concretely-typed listener overloads.
        const bridge = app.createNodeWsBridge({
            WebSocketServer: FakeWebSocketServer,
        });
        expect(typeof bridge.handleUpgrade).toBe('function');
    });

    it('completes the handshake and delivers open/message/close', async () => {
        let openCount = 0;
        const openView: { href: string; room: string | null } = {
            href: '',
            room: null,
        };
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
                        open: (ws) => {
                            openCount++;
                            openView.href = ws.url.href;
                            openView.room = ws.query.get('room');
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
            fakeUpgradeRequest('/chat?room=lobby'),
            fakeSocket,
            Buffer.alloc(0)
        );

        // A real upgrade must not destroy the socket; the framing
        // library's handleUpgrade fires and the open handler runs.
        expect(destroyed).toBe(false);
        expect(openCount).toBe(1);
        // The Node bridge captures the upgrade URL like the other platforms.
        expect(openView.href).toBe('http://localhost/chat?room=lobby');
        expect(openView.room).toBe('lobby');

        const wsInstance =
            FakeWebSocketServer.instances[
                FakeWebSocketServer.instances.length - 1
            ]?.lastSocket;
        expect(wsInstance).not.toBeNull();

        // ws.data must carry the matched route, or getRouteFromWs returns
        // null and these handlers silently no-op.
        //
        // Real 'message' events hand a Buffer even for text frames, with
        // `isBinary: false` distinguishing them. Emitting a string here
        // would hide the decode path entirely.
        wsInstance!.emit(
            'message',
            Buffer.from('hello from a real socket', 'utf-8'),
            false
        );
        wsInstance!.emit('close', 1000, 'bye');

        // Messages are queued behind `open` and delivered in order — let the
        // per-socket chain drain before asserting.
        await new Promise((resolve) => setTimeout(resolve, 0));

        // A text frame (isBinary: false) must decode to a string, matching
        // Bun's native ServerWebSocket, not pass through as a raw Buffer.
        expect(receivedMessages).toEqual(['hello from a real socket']);
        expect(typeof receivedMessages[0]).toBe('string');
        expect(closeResult.value).toEqual({ code: 1000, reason: 'bye' });
    });

    it('destroys the socket instead of throwing on a malformed Host header', async () => {
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
        // A host with a space makes `new Request(...)` throw. The bridge
        // runs inside an async handler, so the throw must be contained.
        await bridge.handleUpgrade(
            {
                url: '/chat',
                headers: {
                    host: 'bad host',
                    upgrade: 'websocket',
                    connection: 'Upgrade',
                },
            },
            fakeSocket,
            Buffer.alloc(0)
        );
        expect(destroyed).toBe(true);
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
