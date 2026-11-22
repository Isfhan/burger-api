/**
 * Regression coverage for the Node bridge and Cloudflare handoff fixes:
 * socket error listeners, upgrade peer IP, maxPayload forwarding, and the
 * Workerd `open` event that never fires after `accept()`.
 */
import { describe, it, expect, afterEach } from 'bun:test';
import { Burger } from '../../src/index';
import { WebSocketAdapter } from '../../src/ws/adapter';
import { WebSocketRouter } from '../../src/ws/router';
import { acceptWsUpgrade } from '../../src/ws/platform';

type Listener = (...args: unknown[]) => void;

class FakeWebSocket {
    private listeners = new Map<string, Listener[]>();
    data?: unknown;

    on(event: string, listener: Listener): this {
        const list = this.listeners.get(event) ?? [];
        list.push(listener);
        this.listeners.set(event, list);
        return this;
    }

    emit(event: string, ...args: unknown[]): void {
        const list = this.listeners.get(event) ?? [];
        // A real socket's 'error' event crashes Node when nobody listens.
        if (event === 'error' && list.length === 0) {
            throw new Error('Unhandled error event');
        }
        for (const listener of list) listener(...args);
    }
}

class FakeWebSocketServer {
    static instances: FakeWebSocketServer[] = [];
    readonly opts: { noServer: true; maxPayload?: number };
    lastSocket: FakeWebSocket | null = null;

    constructor(opts: { noServer: true; maxPayload?: number }) {
        this.opts = opts;
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

class FakeRawSocket {
    private listeners = new Map<string, Listener[]>();
    destroyed = false;

    on(event: string, listener: Listener): this {
        const list = this.listeners.get(event) ?? [];
        list.push(listener);
        this.listeners.set(event, list);
        return this;
    }

    destroy(): void {
        this.destroyed = true;
    }

    emit(event: string, ...args: unknown[]): void {
        const list = this.listeners.get(event) ?? [];
        if (event === 'error' && list.length === 0) {
            throw new Error('Unhandled error event');
        }
        for (const listener of list) listener(...args);
    }
}

function fakeUpgradeRequest(url: string, remoteAddress?: string) {
    return {
        url,
        headers: {
            host: 'localhost',
            upgrade: 'websocket',
            connection: 'Upgrade',
        },
        socket: remoteAddress ? { remoteAddress } : undefined,
    };
}

function createRoute() {
    return { path: '/chat', handlers: {}, config: {} };
}

const UPGRADE_HEADERS = {
    upgrade: 'websocket',
    connection: 'Upgrade',
    'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'sec-websocket-version': '13',
};

afterEach(() => {
    delete (globalThis as Record<string, unknown>).WebSocketPair;
});

describe('Node bridge socket errors', () => {
    it('listens for errors on the framed socket instead of crashing', async () => {
        const app = new Burger({
            apiRoutes: [],
            wsRoutes: [{ path: '/chat', handlers: { open: () => {} } }],
        });
        await app.fetchHandler();
        const bridge = app.createNodeWsBridge({
            WebSocketServer: FakeWebSocketServer,
        });

        await bridge.handleUpgrade(
            fakeUpgradeRequest('/chat'),
            new FakeRawSocket(),
            Buffer.alloc(0)
        );

        const ws = FakeWebSocketServer.instances.at(-1)!.lastSocket!;
        expect(() =>
            ws.emit('error', new Error('malformed frame'))
        ).not.toThrow();
    });

    it('listens for errors on the raw upgrade socket before auth resolves', async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const router = new WebSocketRouter();
        router.addRoute(createRoute());
        const adapter = new WebSocketAdapter({
            router,
            pluginBeforeRoute: [
                async () => {
                    await gate;
                },
            ],
        });
        const bridge = adapter.createNodeWsBridge({
            WebSocketServer: FakeWebSocketServer,
        });

        const raw = new FakeRawSocket();
        const pending = bridge.handleUpgrade(
            fakeUpgradeRequest('/chat'),
            raw,
            Buffer.alloc(0)
        );
        // The guard must be attached before the async auth chain resolves.
        expect(() => raw.emit('error', new Error('upgrade error'))).not.toThrow();
        release();
        await pending;
    });
});

describe('Node bridge upgrade parity', () => {
    it('sets ctx.ip from the raw upgrade socket peer address', async () => {
        const router = new WebSocketRouter();
        router.addRoute(createRoute());
        let seen: string | null | undefined;
        const adapter = new WebSocketAdapter({
            router,
            pluginBeforeRoute: [
                (ctx) => {
                    seen = ctx.ip;
                },
            ],
        });
        const bridge = adapter.createNodeWsBridge({
            WebSocketServer: FakeWebSocketServer,
        });

        await bridge.handleUpgrade(
            fakeUpgradeRequest('/chat', '203.0.113.9'),
            new FakeRawSocket(),
            Buffer.alloc(0)
        );

        expect(seen).toBe('203.0.113.9');
    });

    it('forwards wsConfig.maxPayloadLength as maxPayload and nothing else', async () => {
        const app = new Burger({
            apiRoutes: [],
            wsRoutes: [{ path: '/chat', handlers: {} }],
        });
        app.wsConfig({ maxPayloadLength: 4096, idleTimeout: 10 });
        await app.fetchHandler();

        app.createNodeWsBridge({ WebSocketServer: FakeWebSocketServer });

        const server = FakeWebSocketServer.instances.at(-1)!;
        expect(server.opts).toEqual({
            noServer: true,
            maxPayload: 4096,
        });
    });
});

describe('Cloudflare open event after accept', () => {
    it('fires onOpen exactly once when workerd never emits open', () => {
        const listeners = new Map<string, Function>();
        let accepted = 0;
        (globalThis as Record<string, unknown>).WebSocketPair = function (
            this: unknown
        ) {
            return [
                {
                    accept() {
                        accepted++;
                    },
                    addEventListener(type: string, fn: Function) {
                        listeners.set(type, fn);
                    },
                },
                { side: 'client' },
            ];
        };

        const opened: unknown[] = [];
        const response = acceptWsUpgrade({
            platform: 'cloudflare',
            request: new Request('http://localhost/chat', {
                headers: UPGRADE_HEADERS,
            }),
            data: {},
            events: {
                onOpen(raw) {
                    opened.push(raw);
                },
                onMessage() {},
                onClose() {},
            },
        }) as Response;

        expect(response.status).toBe(101);
        expect(accepted).toBe(1);
        expect(opened.length).toBe(1);

        // A runtime that does emit 'open' must not run the hook twice.
        (listeners.get('open') as Function)({});
        expect(opened.length).toBe(1);
    });
});
