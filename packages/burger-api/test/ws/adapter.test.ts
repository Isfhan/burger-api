import { describe, it, expect, beforeEach } from 'bun:test';
import { WebSocketAdapter } from '../../src/ws/adapter';
import { WebSocketRouter } from '../../src/ws/router';
import type { CompiledWebSocketRoute, WebSocketConfig } from '../../src/ws/types';

describe('WebSocketAdapter (Phase 9)', () => {
    let router: WebSocketRouter;

    beforeEach(() => {
        router = new WebSocketRouter();
    });

    const createRoute = (path: string, overrides: Partial<CompiledWebSocketRoute> = {}): CompiledWebSocketRoute => ({
        path,
        handlers: {},
        config: {},
        ...overrides,
    });

    it('should create adapter with default config', () => {
        const adapter = new WebSocketAdapter({ router });
        expect(adapter).toBeDefined();
    });

    it('should create adapter with custom config', () => {
        const config: WebSocketConfig = {
            maxPayloadLength: 2048,
            idleTimeout: 60,
        };
        const adapter = new WebSocketAdapter({ router, config });
        expect(adapter).toBeDefined();
    });

    it('should create adapter with debug mode', () => {
        const adapter = new WebSocketAdapter({ router, debug: true });
        expect(adapter).toBeDefined();
    });

    it('should create websocket option object', () => {
        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();

        expect(wsOption).toBeDefined();
        expect(typeof wsOption.open).toBe('function');
        expect(typeof wsOption.message).toBe('function');
        expect(typeof wsOption.close).toBe('function');
        expect(typeof wsOption.drain).toBe('function');
        expect(typeof wsOption.ping).toBe('function');
        expect(typeof wsOption.pong).toBe('function');
    });

    it('should create fetch handler', () => {
        const adapter = new WebSocketAdapter({ router });
        const fetchHandler = adapter.createFetchHandler();

        expect(typeof fetchHandler).toBe('function');
    });

    it('should handle non-WebSocket upgrade requests', async () => {
        const adapter = new WebSocketAdapter({ router });
        const fetchHandler = adapter.createFetchHandler();

        // Create a regular HTTP request (not WebSocket upgrade)
        const request = new Request('http://localhost/chat');
        const response = await fetchHandler(request, {} as any);

        // Should return undefined (not a WebSocket upgrade)
        expect(response).toBeUndefined();
    });

    it('should handle WebSocket upgrade with no matching route', async () => {
        const adapter = new WebSocketAdapter({ router });
        const fetchHandler = adapter.createFetchHandler();

        // Create a WebSocket upgrade request
        const request = new Request('http://localhost/chat', {
            headers: {
                upgrade: 'websocket',
                connection: 'Upgrade',
            },
        });

        // Mock server.upgrade
        const mockServer = {
            upgrade: () => false,
        };

        const response = await fetchHandler(request, mockServer as any);

        // Should return 404 response
        expect(response).toBeInstanceOf(Response);
        expect((response as Response).status).toBe(404);
    });

    it('should handle WebSocket upgrade with matching route', async () => {
        // Add a route to the router
        const route = createRoute('/chat');
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const fetchHandler = adapter.createFetchHandler();

        // Create a WebSocket upgrade request
        const request = new Request('http://localhost/chat', {
            headers: {
                upgrade: 'websocket',
                connection: 'Upgrade',
            },
        });

        // Mock server.upgrade
        let upgradeCalled = false;
        let upgradeOptions: any = null;
        const mockServer = {
            upgrade: (req: any, opts: any) => {
                upgradeCalled = true;
                upgradeOptions = opts;
                return true;
            },
        };

        const response = await fetchHandler(request, mockServer as any);

        // Should call upgrade
        expect(upgradeCalled).toBe(true);
        expect(upgradeOptions).toBeDefined();
        expect(upgradeOptions.data.route.path).toBe(route.path);
    });

    it('should call open handler when connection opens', () => {
        let openCalled = false;
        const route = createRoute('/chat', {
            handlers: {
                open: (ws) => { openCalled = true; },
            },
        });
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();

        // Mock WebSocket with route data
        const mockWs = {
            data: { route },
            send: () => {},
            close: () => {},
            readyState: 1,
            remoteAddress: '127.0.0.1',
        };

        wsOption.open(mockWs);

        expect(openCalled).toBe(true);
    });

    it('should call message handler when message received', () => {
        let receivedMessage: any = null;
        const route = createRoute('/chat', {
            handlers: {
                message: (ws, msg) => { receivedMessage = msg; },
            },
        });
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();

        // Mock WebSocket with route data
        const mockWs = {
            data: { route },
            send: () => {},
            close: () => {},
            readyState: 1,
            remoteAddress: '127.0.0.1',
        };

        wsOption.message(mockWs, 'hello');

        expect(receivedMessage).toBe('hello');
    });

    it('should call close handler when connection closes', () => {
        let closeCode: number | null = null;
        let closeReason: string | null = null;
        const route = createRoute('/chat', {
            handlers: {
                close: (ws, code, reason) => {
                    closeCode = code;
                    closeReason = reason;
                },
            },
        });
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();

        // Mock WebSocket with route data
        const mockWs = {
            data: { route },
            send: () => {},
            close: () => {},
            readyState: 1,
            remoteAddress: '127.0.0.1',
        };

        wsOption.close(mockWs, 1000, 'bye');

        expect(closeCode).toBe(1000);
        expect(closeReason).toBe('bye');
    });

    it('should run hooks before handlers', () => {
        const callOrder: string[] = [];
        const route = createRoute('/chat', {
            handlers: {
                open: (ws) => { callOrder.push('handler.open'); },
                message: (ws, msg) => { callOrder.push('handler.message'); },
            },
            hooks: {
                onOpen: (ws) => { callOrder.push('hook.onOpen'); },
                onMessage: (ws, msg) => { callOrder.push('hook.onMessage'); },
            },
        });
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();

        // Mock WebSocket with route data
        const mockWs = {
            data: { route },
            send: () => {},
            close: () => {},
            readyState: 1,
            remoteAddress: '127.0.0.1',
        };

        wsOption.open(mockWs);
        wsOption.message(mockWs, 'hello');

        expect(callOrder).toEqual(['hook.onOpen', 'handler.open', 'hook.onMessage', 'handler.message']);
    });

    it('should handle errors in hooks gracefully', () => {
        const route = createRoute('/chat', {
            handlers: {
                open: (ws) => {},
            },
            hooks: {
                onOpen: (ws) => { throw new Error('Hook error'); },
            },
        });
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();

        // Mock WebSocket with route data
        const mockWs = {
            data: { route },
            send: () => {},
            close: () => {},
            readyState: 1,
            remoteAddress: '127.0.0.1',
        };

        // Should not throw
        expect(() => wsOption.open(mockWs)).not.toThrow();
    });

    it('should handle errors in handlers gracefully', () => {
        const route = createRoute('/chat', {
            handlers: {
                open: (ws) => { throw new Error('Handler error'); },
            },
        });
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();

        // Mock WebSocket with route data
        const mockWs = {
            data: { route },
            send: () => {},
            close: () => {},
            readyState: 1,
            remoteAddress: '127.0.0.1',
        };

        // Should not throw
        expect(() => wsOption.open(mockWs)).not.toThrow();
    });

    it('should handle missing route gracefully', () => {
        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();

        // Mock WebSocket without route data
        const mockWs = {
            data: {},
            send: () => {},
            close: () => {},
            readyState: 1,
            remoteAddress: '127.0.0.1',
        };

        // Should not throw
        expect(() => wsOption.open(mockWs)).not.toThrow();
        expect(() => wsOption.message(mockWs, 'hello')).not.toThrow();
        expect(() => wsOption.close(mockWs, 1000, 'bye')).not.toThrow();
    });

    it('should create BurgerWSContext from raw WebSocket', () => {
        let sentMessage: any = null;
        const route = createRoute('/chat', {
            handlers: {
                open: (ws) => { ws.send('test'); },
            },
        });
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const wsOption = adapter.createWebSocketOption();

        // Mock WebSocket (needs sendText for BurgerWSContext.send with string)
        const mockWs = {
            data: { route },
            send: (msg: any) => { sentMessage = msg; },
            sendText: (msg: any) => { sentMessage = msg; },
            sendBinary: (msg: any) => { sentMessage = msg; },
            close: () => {},
            terminate: () => {},
            subscribe: () => {},
            unsubscribe: () => {},
            publish: () => {},
            publishText: () => {},
            publishBinary: () => {},
            isSubscribed: () => false,
            cork: (cb: () => void) => cb(),
            readyState: 1,
            remoteAddress: '127.0.0.1',
        };

        wsOption.open(mockWs);

        expect(sentMessage).toBe('test');
    });
});
