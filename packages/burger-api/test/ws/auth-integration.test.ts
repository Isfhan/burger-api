import { describe, it, expect, beforeEach } from 'bun:test';
import { WebSocketAdapter } from '../../src/ws/adapter';
import { WebSocketRouter } from '../../src/ws/router';
import type { CompiledWebSocketRoute, WebSocketConfig } from '../../src/ws/types';
import type { BurgerContext } from '../../src/context/context';

describe('WebSocket Auth Integration (Phase 10)', () => {
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

    const createUpgradeRequest = (path = '/chat') => new Request(`http://localhost${path}`, {
        headers: {
            upgrade: 'websocket',
            connection: 'Upgrade',
        },
    });

    const createMockServer = () => ({
        upgrade: (_req: any, opts: any) => {
            return { upgraded: true, data: opts.data };
        },
    });

    describe('auth hook execution', () => {
        it('should run transform hooks during upgrade', async () => {
            let transformCalled = false;
            const route = createRoute('/chat');
            router.addRoute(route);

            const adapter = new WebSocketAdapter({
                router,
                pluginTransform: {
                    user: (ctx: BurgerContext) => {
                        transformCalled = true;
                        return { sub: 'user-123', name: 'Test User' };
                    },
                },
            });

            const fetchHandler = adapter.createFetchHandler();
            const request = createUpgradeRequest();
            const mockServer = { upgrade: () => true };

            await fetchHandler(request, mockServer as any);

            expect(transformCalled).toBe(true);
        });

        it('should run beforeRoute hooks during upgrade', async () => {
            let beforeRouteCalled = false;
            const route = createRoute('/chat');
            router.addRoute(route);

            const adapter = new WebSocketAdapter({
                router,
                pluginBeforeRoute: [
                    async (ctx: BurgerContext) => {
                        beforeRouteCalled = true;
                    },
                ],
            });

            const fetchHandler = adapter.createFetchHandler();
            const request = createUpgradeRequest();
            const mockServer = { upgrade: () => true };

            await fetchHandler(request, mockServer as any);

            expect(beforeRouteCalled).toBe(true);
        });

        it('should pass user data to upgrade options', async () => {
            const route = createRoute('/chat');
            router.addRoute(route);

            const adapter = new WebSocketAdapter({
                router,
                pluginTransform: {
                    user: (ctx: BurgerContext) => {
                        return { sub: 'user-123', name: 'Test User' };
                    },
                },
            });

            const fetchHandler = adapter.createFetchHandler();
            const request = createUpgradeRequest();
            let upgradeData: any = null;
            const mockServer = {
                upgrade: (req: any, opts: any) => {
                    upgradeData = opts.data;
                    return true;
                },
            };

            await fetchHandler(request, mockServer as any);

            expect(upgradeData).toBeDefined();
            expect(upgradeData.user).toBeDefined();
            expect(upgradeData.user.sub).toBe('user-123');
        });
    });

    describe('auth failure handling', () => {
        it('should return 401 when beforeRoute hook returns Response', async () => {
            const route = createRoute('/chat');
            router.addRoute(route);

            const adapter = new WebSocketAdapter({
                router,
                pluginBeforeRoute: [
                    async (ctx: BurgerContext) => {
                        return new Response(
                            JSON.stringify({ detail: 'Unauthorized' }),
                            { status: 401, headers: { 'Content-Type': 'application/json' } }
                        );
                    },
                ],
            });

            const fetchHandler = adapter.createFetchHandler();
            const request = createUpgradeRequest();
            const mockServer = { upgrade: () => true };

            const response = await fetchHandler(request, mockServer as any);

            expect(response).toBeInstanceOf(Response);
            expect((response as Response).status).toBe(401);
        });

        it('should return 403 when auth hook throws ForbiddenError', async () => {
            const route = createRoute('/chat');
            router.addRoute(route);

            class ForbiddenError extends Error {
                status = 403;
                constructor(message: string) {
                    super(message);
                    this.name = 'ForbiddenError';
                }
            }

            const adapter = new WebSocketAdapter({
                router,
                pluginBeforeRoute: [
                    async (ctx: BurgerContext) => {
                        throw new ForbiddenError('Insufficient permissions');
                    },
                ],
                debug: false,
            });

            const fetchHandler = adapter.createFetchHandler();
            const request = createUpgradeRequest();
            const mockServer = { upgrade: () => true };

            const response = await fetchHandler(request, mockServer as any);

            expect(response).toBeInstanceOf(Response);
            expect((response as Response).status).toBe(403);
        });

        it('should return 401 when auth required but no user provided', async () => {
            const route = createRoute('/chat', {
                config: { auth: { required: true } },
            });
            router.addRoute(route);

            const adapter = new WebSocketAdapter({
                router,
                pluginTransform: {
                    user: (ctx: BurgerContext) => undefined,
                },
            });

            const fetchHandler = adapter.createFetchHandler();
            const request = createUpgradeRequest();
            const mockServer = { upgrade: () => true };

            const response = await fetchHandler(request, mockServer as any);

            expect(response).toBeInstanceOf(Response);
            expect((response as Response).status).toBe(401);
        });
    });

    describe('auth bypass', () => {
        it('should skip auth when config.auth.required is false', async () => {
            let transformCalled = false;
            const route = createRoute('/chat', {
                config: { auth: { required: false } },
            });
            router.addRoute(route);

            const adapter = new WebSocketAdapter({
                router,
                pluginTransform: {
                    user: (ctx: BurgerContext) => {
                        transformCalled = true;
                        return { sub: 'user-123' };
                    },
                },
            });

            const fetchHandler = adapter.createFetchHandler();
            const request = createUpgradeRequest();
            let upgradeData: any = null;
            const mockServer = {
                upgrade: (req: any, opts: any) => {
                    upgradeData = opts.data;
                    return true;
                },
            };

            const response = await fetchHandler(request, mockServer as any);

            // Auth should still run (transform hooks always run)
            expect(transformCalled).toBe(true);
            // But connection should succeed
            expect(upgradeData).toBeDefined();
        });

        it('should allow connection without auth plugins', async () => {
            const route = createRoute('/chat');
            router.addRoute(route);

            const adapter = new WebSocketAdapter({
                router,
                // No auth plugins
            });

            const fetchHandler = adapter.createFetchHandler();
            const request = createUpgradeRequest();
            let upgradeCalled = false;
            const mockServer = {
                upgrade: (req: any, opts: any) => {
                    upgradeCalled = true;
                    return true;
                },
            };

            const response = await fetchHandler(request, mockServer as any);

            expect(upgradeCalled).toBe(true);
        });
    });

    describe('provider injection', () => {
        it('should inject providers into WebSocketAdapter', async () => {
            const route = createRoute('/chat');
            router.addRoute(route);

            const providers = new Map<string, unknown>([
                ['db', { query: () => 'result' }],
            ]);

            const adapter = new WebSocketAdapter({
                router,
                providers,
            });

            expect(adapter).toBeDefined();
        });

        it('should make services available in handlers', async () => {
            let capturedServices: Record<string, unknown> | null = null;
            const route = createRoute('/chat', {
                handlers: {
                    open: (ws) => {
                        capturedServices = ws.services;
                    },
                },
            });
            router.addRoute(route);

            const providers = new Map<string, unknown>([
                ['logger', { info: () => {} }],
            ]);

            const adapter = new WebSocketAdapter({ router, providers });
            const wsOption = adapter.createWebSocketOption();

            const mockWs = {
                data: { route },
                send: () => {},
                sendText: () => {},
                sendBinary: () => {},
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

            expect(capturedServices).toBeDefined();
            expect(capturedServices?.logger).toBeDefined();
        });
    });
});
