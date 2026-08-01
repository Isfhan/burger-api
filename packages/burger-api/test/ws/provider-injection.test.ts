import { describe, it, expect, beforeEach } from 'bun:test';
import { BurgerWSContext } from '../../src/ws/types';

describe('BurgerWSContext', () => {
    const createMockWs = (data: Record<string, unknown> = {}) => ({
        data,
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
    });

    describe('services property', () => {
        it('should have empty services when no providers given', () => {
            const ws = new BurgerWSContext(createMockWs());
            expect(ws.services).toBeDefined();
            expect(Object.keys(ws.services)).toHaveLength(0);
        });

        it('should inject providers as services', () => {
            const providers = new Map<string, unknown>([
                ['db', { query: () => {} }],
                ['logger', { info: () => {} }],
            ]);
            const ws = new BurgerWSContext(createMockWs(), providers);

            expect(ws.services.db).toBeDefined();
            expect(ws.services.logger).toBeDefined();
            expect(typeof (ws.services.db as any).query).toBe('function');
            expect(typeof (ws.services.logger as any).info).toBe('function');
        });

        it('should return same reference for services', () => {
            const providers = new Map<string, unknown>([
                ['db', { query: () => {} }],
            ]);
            const ws = new BurgerWSContext(createMockWs(), providers);

            expect(ws.services).toBe(ws.services);
        });
    });

    describe('user property', () => {
        it('should return undefined when no user in data', () => {
            const ws = new BurgerWSContext(createMockWs({}));
            expect(ws.user).toBeUndefined();
        });

        it('should return user from data', () => {
            const user = { sub: 'user-123', name: 'Test User' };
            const ws = new BurgerWSContext(createMockWs({ user }));
            expect(ws.user).toEqual(user);
        });

        it('should return user set during upgrade', () => {
            const user = { sub: 'jwt-user', roles: ['admin'] };
            const ws = new BurgerWSContext(createMockWs({ route: {}, user }));
            expect(ws.user).toEqual(user);
        });
    });

    describe('services in handlers', () => {
        it('should have services available in open handler', () => {
            let capturedServices: Record<string, unknown> | null = null;
            const providers = new Map<string, unknown>([
                ['db', { query: () => 'result' }],
            ]);
            const ws = new BurgerWSContext(
                createMockWs({ route: {} }),
                providers
            );

            // Simulate open handler
            capturedServices = ws.services;
            expect(capturedServices?.db).toBeDefined();
        });

        it('should have services available in message handler', () => {
            let capturedServices: Record<string, unknown> | null = null;
            const providers = new Map<string, unknown>([
                ['cache', { get: () => 'cached' }],
            ]);
            const ws = new BurgerWSContext(
                createMockWs({ route: {} }),
                providers
            );

            // Simulate message handler
            capturedServices = ws.services;
            expect(capturedServices?.cache).toBeDefined();
        });

        it('should have services available in close handler', () => {
            let capturedServices: Record<string, unknown> | null = null;
            const providers = new Map<string, unknown>([
                ['logger', { warn: () => {} }],
            ]);
            const ws = new BurgerWSContext(
                createMockWs({ route: {} }),
                providers
            );

            // Simulate close handler
            capturedServices = ws.services;
            expect(capturedServices?.logger).toBeDefined();
        });
    });
});
