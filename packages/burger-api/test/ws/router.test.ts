import { describe, it, expect, beforeEach } from 'bun:test';
import { WebSocketRouter } from '../../src/ws/router';
import type { CompiledWebSocketRoute } from '../../src/ws/types';

describe('WebSocketRouter', () => {
    let router: WebSocketRouter;

    const createRoute = (
        path: string,
        overrides: Partial<CompiledWebSocketRoute> = {}
    ): CompiledWebSocketRoute => ({
        path,
        handlers: {},
        config: {},
        ...overrides,
    });

    beforeEach(() => {
        router = new WebSocketRouter();
    });

    it('should start with zero routes', () => {
        expect(router.getRouteCount()).toBe(0);
        expect(router.getRoutes()).toEqual([]);
    });

    it('should add a single route', () => {
        const route = createRoute('/chat');
        router.addRoute(route);

        expect(router.getRouteCount()).toBe(1);
        expect(router.getRoutes()).toHaveLength(1);
    });

    it('should add multiple routes', () => {
        const routes = [
            createRoute('/chat'),
            createRoute('/notifications'),
            createRoute('/status'),
        ];
        router.addRoutes(routes);

        expect(router.getRouteCount()).toBe(3);
    });

    it('should match static routes', () => {
        const route = createRoute('/chat');
        router.addRoute(route);

        const match = router.match('/chat');
        expect(match).not.toBeNull();
        expect(match?.route.path).toBe('/chat');
        expect(match?.params).toEqual({});
    });

    it('should return null for unmatched static routes', () => {
        const route = createRoute('/chat');
        router.addRoute(route);

        const match = router.match('/notifications');
        expect(match).toBeNull();
    });

    it('should match parameterized routes', () => {
        const route = createRoute('/chat/:room');
        router.addRoute(route);

        const match = router.match('/chat/general');
        expect(match).not.toBeNull();
        expect(match?.route.path).toBe('/chat/:room');
        expect(match?.params).toEqual({ room: 'general' });
    });

    it('should match multiple parameters', () => {
        const route = createRoute('/chat/:room/:userId');
        router.addRoute(route);

        const match = router.match('/chat/general/123');
        expect(match).not.toBeNull();
        expect(match?.params).toEqual({ room: 'general', userId: '123' });
    });

    it('should return null for parameterized route with wrong structure', () => {
        const route = createRoute('/chat/:room');
        router.addRoute(route);

        // Different path depth
        const match = router.match('/chat/general/extra');
        expect(match).toBeNull();
    });

    it('should match wildcard routes', () => {
        const route = createRoute('/files/*');
        router.addRoute(route);

        const match = router.match('/files/path/to/file.txt');
        expect(match).not.toBeNull();
        expect(match?.route.path).toBe('/files/*');
        expect(match?.params).toEqual({ '*': 'path/to/file.txt' });
    });

    it('should match wildcard at root', () => {
        const route = createRoute('/*');
        router.addRoute(route);

        const match = router.match('/anything/here');
        expect(match).not.toBeNull();
        expect(match?.params).toEqual({ '*': 'anything/here' });
    });

    it('should return null for wildcard route with wrong prefix', () => {
        const route = createRoute('/files/*');
        router.addRoute(route);

        const match = router.match('/images/pic.jpg');
        expect(match).toBeNull();
    });

    it('should prefer static routes over parameterized routes', () => {
        const staticRoute = createRoute('/chat');
        const paramRoute = createRoute('/:type');
        router.addRoute(staticRoute);
        router.addRoute(paramRoute);

        const match = router.match('/chat');
        expect(match?.route.path).toBe('/chat');
    });

    it('should prefer parameterized routes over wildcard routes', () => {
        const paramRoute = createRoute('/:type');
        const wildcardRoute = createRoute('/*');
        router.addRoute(paramRoute);
        router.addRoute(wildcardRoute);

        const match = router.match('/chat');
        expect(match?.route.path).toBe('/:type');
    });

    it('should handle empty path', () => {
        const route = createRoute('/');
        router.addRoute(route);

        const match = router.match('/');
        expect(match).not.toBeNull();
        expect(match?.route.path).toBe('/');
    });

    it('should handle multiple static routes', () => {
        const route1 = createRoute('/chat');
        const route2 = createRoute('/notifications');
        const route3 = createRoute('/status');
        router.addRoute(route1);
        router.addRoute(route2);
        router.addRoute(route3);

        expect(router.match('/chat')?.route.path).toBe('/chat');
        expect(router.match('/notifications')?.route.path).toBe(
            '/notifications'
        );
        expect(router.match('/status')?.route.path).toBe('/status');
    });

    it('should handle multiple parameterized routes', () => {
        const route1 = createRoute('/chat/:room');
        const route2 = createRoute('/user/:userId');
        router.addRoute(route1);
        router.addRoute(route2);

        const match1 = router.match('/chat/general');
        const match2 = router.match('/user/123');

        expect(match1?.route.path).toBe('/chat/:room');
        expect(match1?.params.room).toBe('general');

        expect(match2?.route.path).toBe('/user/:userId');
        expect(match2?.params.userId).toBe('123');
    });

    it('should handle trailing slash mismatch', () => {
        const route = createRoute('/chat');
        router.addRoute(route);

        const match = router.match('/chat/');
        expect(match).toBeNull();
    });
});
