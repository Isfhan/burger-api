import { describe, it, expect } from 'bun:test';
import { BurgerContext } from '../../src/context/context';

describe('Provider system (burger.provide)', () => {
    it('services is empty by default', () => {
        const ctx = BurgerContext.create(new Request('http://localhost/'));
        expect(ctx.services).toEqual({});
    });

    it('populates ctx.services from providers map', () => {
        const providers = new Map<string, unknown>([
            ['db', { query: () => 'ok' }],
            ['logger', { info: () => {} }],
        ]);
        const ctx = BurgerContext.create(
            new Request('http://localhost/'),
            undefined,
            undefined,
            providers
        );
        expect(ctx.services.db).toBeDefined();
        expect(ctx.services.logger).toBeDefined();
        expect(typeof ctx.services.db.query).toBe('function');
    });

    it('each context gets its own services object (shallow copy)', () => {
        const providers = new Map<string, unknown>([
            ['db', { count: 0 }],
        ]);
        const ctx1 = BurgerContext.create(
            new Request('http://localhost/'),
            undefined,
            undefined,
            providers
        );
        const ctx2 = BurgerContext.create(
            new Request('http://localhost/'),
            undefined,
            undefined,
            providers
        );
        // Each context gets its own services object (not the same reference)
        expect(ctx1.services).not.toBe(ctx2.services);
        // But service values are shared singletons (correct — created once at startup)
        expect(ctx1.services.db).toBe(ctx2.services.db);
    });

    it('providers map mutation after create does not affect existing contexts', () => {
        const providers = new Map<string, unknown>([
            ['db', { count: 0 }],
        ]);
        const ctx = BurgerContext.create(
            new Request('http://localhost/'),
            undefined,
            undefined,
            providers
        );
        providers.set('mailer', { send: () => {} });
        expect(ctx.services.mailer).toBeUndefined();
    });

    it('empty providers map produces empty services', () => {
        const providers = new Map<string, unknown>();
        const ctx = BurgerContext.create(
            new Request('http://localhost/'),
            undefined,
            undefined,
            providers
        );
        expect(ctx.services).toEqual({});
    });
});

describe('Route config (config.ts)', () => {
    it('config is undefined by default', () => {
        const ctx = BurgerContext.create(new Request('http://localhost/'));
        expect(ctx.config).toBeUndefined();
    });

    it('config is accessible from context', () => {
        const config = { auth: false, cache: true, timeout: 5000 };
        const ctx = BurgerContext.create(
            new Request('http://localhost/'),
            undefined,
            undefined,
            undefined,
            config
        );
        expect(ctx.config).toEqual(config);
        expect(ctx.config?.auth).toBe(false);
    });
});
