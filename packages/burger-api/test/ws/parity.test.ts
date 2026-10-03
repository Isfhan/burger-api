import { describe, it, expect, beforeEach } from 'bun:test';
import { WebSocketAdapter } from '../../src/ws/adapter';
import { WebSocketRouter } from '../../src/ws/router';
import type { CompiledWebSocketRoute } from '../../src/ws/types';

function createRoute(
    path: string,
    overrides: Partial<CompiledWebSocketRoute> = {}
): CompiledWebSocketRoute {
    return { path, handlers: {}, config: {}, ...overrides };
}

function mockWs(data: unknown) {
    return {
        data,
        send: () => {},
        sendText: () => {},
        sendBinary: () => {},
        close: () => {},
        terminate: () => {},
        readyState: 1,
        remoteAddress: '127.0.0.1',
    };
}

describe('WebSocket message ordering', () => {
    let router: WebSocketRouter;
    beforeEach(() => {
        router = new WebSocketRouter();
    });

    it('delivers messages in order and only after open finished', async () => {
        const order: string[] = [];
        let releaseOpen: (() => void) | undefined;
        const openGate = new Promise<void>((resolve) => {
            releaseOpen = resolve;
        });
        const route = createRoute('/chat', {
            handlers: {
                open: async () => {
                    order.push('open-start');
                    await openGate;
                    order.push('open-end');
                },
                message: async (_ws, msg) => {
                    order.push(`msg:${msg}`);
                },
            },
        });
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const option = adapter.createWebSocketOption();
        const ws = mockWs({ route });

        const openPromise = option.open(ws);
        const first = option.message(ws, 'a');
        const second = option.message(ws, 'b');

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(order).toEqual(['open-start']);

        releaseOpen!();
        await openPromise;
        await first;
        await second;
        expect(order).toEqual([
            'open-start',
            'open-end',
            'msg:a',
            'msg:b',
        ]);
    });

    it('still runs the first event synchronously when nothing is queued', () => {
        let opened = false;
        const route = createRoute('/sync', {
            handlers: {
                open: () => {
                    opened = true;
                },
            },
        });
        router.addRoute(route);
        const adapter = new WebSocketAdapter({ router });
        const option = adapter.createWebSocketOption();
        option.open(mockWs({ route }));
        expect(opened).toBe(true);
    });
});

describe('WebSocket param specificity', () => {
    it('prefers the route with a static segment (like HTTP)', () => {
        const router = new WebSocketRouter();
        router.addRoute(createRoute('/:a/:b'));
        router.addRoute(createRoute('/chat/:room'));

        const match = router.match('/chat/x');
        expect(match?.route.path).toBe('/chat/:room');
        expect(match?.params).toEqual({ room: 'x' });
    });

    it('prefers a param over a wildcard', () => {
        const router = new WebSocketRouter();
        router.addRoute(createRoute('/*'));
        router.addRoute(createRoute('/:type'));

        expect(router.match('/chat')?.route.path).toBe('/:type');
    });

    it('prefers the longer wildcard prefix', () => {
        const router = new WebSocketRouter();
        router.addRoute(createRoute('/*'));
        router.addRoute(createRoute('/files/*'));

        expect(router.match('/files/a')?.route.path).toBe('/files/*');
    });
});

describe('WebSocket wildcardParams', () => {
    it('mirrors HTTP ctx.wildcardParams and keeps params["*"]', () => {
        const router = new WebSocketRouter();
        router.addRoute(createRoute('/files/*'));

        const match = router.match('/files/a/b%20c');
        expect(match?.params['*']).toBe('a/b%20c');
        expect(match?.wildcardParams).toEqual(['a', 'b c']);
    });

    it('is exposed on ws.wildcardParams after the upgrade match', async () => {
        const router = new WebSocketRouter();
        let seen: string[] | undefined;
        const route = createRoute('/files/*', {
            handlers: {
                open: (ws) => {
                    seen = ws.wildcardParams;
                },
            },
        });
        router.addRoute(route);

        const adapter = new WebSocketAdapter({ router });
        const request = new Request('http://localhost/files/a/b', {
            headers: { upgrade: 'websocket', connection: 'Upgrade' },
        });
        let captured: any;
        const server = {
            upgrade: (_req: unknown, opts: any) => {
                captured = opts;
                return true;
            },
        };
        const outcome = await adapter.handleUpgrade(request, server);
        expect(outcome.handled).toBe(true);

        const option = adapter.createWebSocketOption();
        option.open(mockWs(captured.data));
        expect(seen).toEqual(['a', 'b']);
    });
});
