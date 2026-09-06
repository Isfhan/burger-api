/**
 * WebSocket platform seam: runtime detection, explicit upgrade outcomes
 * (no more post-upgrade HTTP fall-through), Cloudflare/Deno handoff wiring,
 * Node 501 guidance, and loud degradation of Bun-only socket capabilities.
 */
import { describe, it, expect, afterEach } from 'bun:test';
import { Burger } from '../../src/index';
import { WebSocketAdapter } from '../../src/ws/adapter';
import { WebSocketRouter } from '../../src/ws/router';
import {
    acceptWsUpgrade,
    detectWsPlatform,
    type WsEventSink,
} from '../../src/ws/platform';
import { BurgerWSContext } from '../../src/ws/types';

const UPGRADE_HEADERS = {
    upgrade: 'websocket',
    connection: 'Upgrade',
    'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'sec-websocket-version': '13',
};

function upgradeRequest(path = '/ws'): Request {
    return new Request(`http://localhost${path}`, {
        headers: UPGRADE_HEADERS,
    });
}

afterEach(() => {
    delete (globalThis as Record<string, unknown>).WebSocketPair;
    delete (globalThis as Record<string, unknown>).Deno;
});

describe('detectWsPlatform', () => {
    it('prefers an explicit Bun server handle', () => {
        expect(
            detectWsPlatform({ upgrade: () => true })
        ).toBe('bun');
    });

    it('detects Cloudflare via the WebSocketPair global', () => {
        (globalThis as Record<string, unknown>).WebSocketPair = function () {};
        expect(detectWsPlatform(undefined)).toBe('cloudflare');
    });

    it('detects Deno via its upgradeWebSocket API', () => {
        (globalThis as Record<string, unknown>).Deno = {
            upgradeWebSocket: () => {},
        };
        expect(detectWsPlatform(undefined)).toBe('deno');
    });

    it('falls back to node when nothing matches', () => {
        expect(detectWsPlatform(undefined)).toBe('node');
    });
});

describe('acceptWsUpgrade — bun', () => {
    const sink: WsEventSink = {
        onOpen() {},
        onMessage() {},
        onClose() {},
    };

    it('returns a bare handled outcome (socket hijacked by the runtime)', () => {
        const server = { upgrade: () => true };
        // Raw handoff contract: undefined means the runtime took over.
        const outcome = acceptWsUpgrade({
            platform: 'bun',
            request: upgradeRequest(),
            server,
            data: {},
            events: sink,
        });
        expect(outcome).toBeUndefined();
    });

    it('produces a 500 response when the runtime refuses the handoff', () => {
        const outcome = acceptWsUpgrade({
            platform: 'bun',
            request: upgradeRequest(),
            server: { upgrade: () => false },
            data: {},
            events: sink,
        }) as unknown as Response;
        expect(outcome.status).toBe(500);
    });
});

describe('acceptWsUpgrade — cloudflare', () => {
    it('wires push listeners, accepts, and returns the 101 with client socket', () => {
        const listeners = new Map<string, Function>();
        const accepted: boolean[] = [];
        (globalThis as Record<string, unknown>).WebSocketPair = function (
            this: unknown
        ) {
            return [
                {
                    accept() {
                        accepted.push(true);
                    },
                    addEventListener(type: string, fn: Function) {
                        listeners.set(type, fn);
                    },
                },
                { side: 'client' },
            ];
        };

        const opened: unknown[] = [];
        const messages: unknown[] = [];
        const closed: Array<[unknown, number, string]> = [];
        const response = acceptWsUpgrade({
            platform: 'cloudflare',
            request: upgradeRequest(),
            server: undefined,
            data: { route: { path: '/ws' }, user: { id: 'u1' } },
            events: {
                onOpen(raw) {
                    opened.push(raw);
                },
                onMessage(raw, message) {
                    messages.push(message);
                },
                onClose(raw, code, reason) {
                    closed.push([raw, code, reason]);
                },
            },
        }) as Response;

        expect(response.status).toBe(101);
        expect(accepted.length).toBe(1);
        // Events are pushed through the shared sink once the socket opens
        (listeners.get('open') as Function)({});
        expect(opened.length).toBe(1);
        (listeners.get('message') as Function)({ data: 'hello' });
        expect(messages[0]).toBe('hello');
        (listeners.get('close') as Function)({ code: 1000, reason: 'done' });
        expect(closed[0]![2]).toBe('done');
    });
});

describe('acceptWsUpgrade — deno', () => {
    it('passes through the runtime response and wires listeners', () => {
        const listeners = new Map<string, Function>();
        const protocolResponse = new Response(null, { status: 101 });
        (globalThis as Record<string, unknown>).Deno = {
            upgradeWebSocket(_req: Request) {
                return {
                    response: protocolResponse,
                    socket: {
                        addEventListener(type: string, fn: Function) {
                            listeners.set(type, fn);
                        },
                    },
                };
            },
        };
        const messages: unknown[] = [];
        const response = acceptWsUpgrade({
            platform: 'deno',
            request: upgradeRequest(),
            server: undefined,
            data: {},
            events: {
                onOpen() {},
                onMessage(_raw, message) {
                    messages.push(message);
                },
                onClose() {},
            },
        }) as Response;
        expect(response).toBe(protocolResponse);
        (listeners.get('message') as Function)({ data: 'hi' });
        expect(messages[0]).toBe('hi');
    });
});

describe('handleUpgrade outcomes (adapter level)', () => {
    function makeAdapter() {
        const router = new WebSocketRouter();
        router.addRoute({
            path: '/ws',
            handlers: {},
            config: {},
        });
        return new WebSocketAdapter({ router });
    }

    it('reports not-handled for plain HTTP requests', async () => {
        const adapter = makeAdapter();
        const outcome = await adapter.handleUpgrade(
            new Request('http://localhost/ws')
        );
        expect(outcome).toEqual({ handled: false });
    });

    it('reports handled-with-404 for upgrades that match no route', async () => {
        const adapter = makeAdapter();
        const outcome = await adapter.handleUpgrade(upgradeRequest('/nope'));
        expect(outcome.handled).toBe(true);
        expect(
            (outcome as { response?: Response }).response?.status
        ).toBe(404);
    });

    it('returns an explicit 501 on node (fetch entry cannot upgrade there)', async () => {
        const adapter = makeAdapter();
        const outcome = await adapter.handleUpgrade(upgradeRequest('/ws'));
        expect(detectWsPlatform(undefined)).toBe('node'); // bun test env
        expect(outcome.handled).toBe(true);
        expect((outcome as { response?: Response }).response?.status).toBe(501);
    });

    it('a declared vercel target gets an honest capability message, not the Node-bridge suggestion', async () => {
        const router = new WebSocketRouter();
        router.addRoute({ path: '/ws', handlers: {}, config: {} });
        const adapter = new WebSocketAdapter({
            router,
            runtimeTarget: 'vercel',
        });
        const outcome = await adapter.handleUpgrade(upgradeRequest('/ws'));
        expect(outcome.handled).toBe(true);
        const response = (outcome as { response?: Response }).response;
        expect(response?.status).toBe(501);
        const body = await response!.text();
        expect(body).toContain('not supported on the "vercel" deployment target');
        expect(body).not.toContain('createNodeWsBridge');
    });

    it('a declared node target still gets the createNodeWsBridge suggestion', async () => {
        const router = new WebSocketRouter();
        router.addRoute({ path: '/ws', handlers: {}, config: {} });
        const adapter = new WebSocketAdapter({ router, runtimeTarget: 'node' });
        const outcome = await adapter.handleUpgrade(upgradeRequest('/ws'));
        expect(outcome.handled).toBe(true);
        const response = (outcome as { response?: Response }).response;
        expect(response?.status).toBe(501);
        expect(await response!.text()).toContain('createNodeWsBridge');
    });

    it('legacy createFetchHandler stays undefined for non-upgrades', async () => {
        const adapter = makeAdapter();
        const res = await adapter.createFetchHandler()(
            new Request('http://localhost/ws')
        );
        expect(res).toBeUndefined();
    });
});

describe('WinterCG entry consumes upgrades before HTTP', () => {
    it('a matching WS route returns 101 and never reaches the HTTP handler', async () => {
        let httpHit = false;
        const routes = [
            {
                path: '/api/ws',
                handlers: {
                    GET: () => {
                        httpHit = true;
                        return Response.json({ http: true });
                    },
                },
            },
        ];
        const burger = new Burger({
            apiRoutes: routes,
        } as ConstructorParameters<typeof Burger>[0]);
        burger.websocket('/api/ws', { open() {} });

        const listeners = new Map<string, Function>();
        (globalThis as Record<string, unknown>).WebSocketPair = function (
            this: unknown
        ) {
            return [
                {
                    accept() {},
                    addEventListener(type: string, fn: Function) {
                        listeners.set(type, fn);
                    },
                },
                { side: 'client' },
            ];
        };

        const handler = await burger.fetchHandler();
        const res = await handler(upgradeRequest('/api/ws'), undefined);
        expect(res.status).toBe(101);
        expect(httpHit).toBe(false);
    });
});

describe('BurgerWSContext cross-runtime degradation', () => {
    it('routes sends through raw.send on standard sockets', () => {
        const sent: unknown[] = [];
        const ws = new BurgerWSContext({
            send(msg: unknown) {
                sent.push(msg);
            },
        });
        ws.send('text');
        ws.sendText('more');
        ws.sendBinary(Buffer.from([1, 2, 3]));
        expect(sent.length).toBe(3);
    });

    it('fails loud for Bun-only pub/sub off Bun', () => {
        const ws = new BurgerWSContext({
            send() {},
        });
        expect(() => ws.subscribe('room')).toThrow(/pub\/sub/);
        expect(() => ws.publish('room', 'x')).toThrow(/pub\/sub/);
        expect(() => ws.isSubscribed('room')).toThrow(/isSubscribed/);
    });

    it('cork runs directly when the runtime has no batching', () => {
        const ws = new BurgerWSContext({ send() {} });
        let ran = false;
        ws.cork(() => {
            ran = true;
        });
        expect(ran).toBe(true);
    });

    it('terminate falls back to close(1001) on standard sockets', () => {
        const closed: Array<[number | undefined, string | undefined]> = [];
        const ws = new BurgerWSContext({
            send() {},
            close(code?: number, reason?: string) {
                closed.push([code, reason]);
            },
        });
        ws.terminate();
        expect(closed[0]![0]).toBe(1001);
    });
});
