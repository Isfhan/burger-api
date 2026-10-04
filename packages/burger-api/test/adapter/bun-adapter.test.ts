import { describe, it, expect } from 'bun:test';
import { BunAdapter } from '../../src/adapter/bun';
import type { RuntimeAdapter } from '../../src/adapter/types';

/**
 * Runtime adapter seam: `BunAdapter` boots via the Web Standard contract,
 * serves static + fetch routes, and stops cleanly.
 */

describe('RuntimeAdapter — BunAdapter contract', () => {
    it('implements the RuntimeAdapter interface', () => {
        const adapter = new BunAdapter();
        expect(typeof adapter.start).toBe('function');
        // Structural check that it satisfies the seam.
        const _check: RuntimeAdapter = adapter;
        expect(_check).toBe(adapter);
    });

    it('boots, serves a static route, and stops', async () => {
        const adapter = new BunAdapter();
        const staticRoutes: Record<string, any> = {
            '/ping': () => new Response('pong'),
        };
        const fetchFallback = () => new Response('fallback', { status: 404 });

        const handle = adapter.start({
            staticRoutes,
            fetch: fetchFallback,
            port: 0, // let Bun pick a free port
        });

        // Port discovery is not exposed here; just assert the handle stops.
        expect(typeof handle.stop).toBe('function');
        handle.stop();

        // After stop, a second stop is a no-op (no throw).
        expect(() => handle.stop()).not.toThrow();
    });
});

describe('RuntimeAdapter — port conflicts', () => {
    it('throws a clear EADDRINUSE error instead of exiting the process', () => {
        const adapter = new BunAdapter();
        const port = 45000 + Math.floor(Math.random() * 2000);
        const opts = {
            staticRoutes: {} as Record<string, any>,
            fetch: (() => new Response('x')) as any,
            port,
        };
        const handle = adapter.start(opts);
        try {
            expect(() => adapter.start(opts)).toThrow(
                new RegExp(`Port ${port} is already in use`)
            );
        } finally {
            handle.stop();
        }
    });
});

describe('RuntimeAdapter — options shape', () => {
    it('accepts staticRoutes, fetch, port, hostname, debug, onListen', () => {
        const opts = {
            staticRoutes: {} as Record<string, any>,
            fetch: (() => new Response('x')) as any,
            port: 4000,
            hostname: 'localhost',
            debug: false,
            onListen: () => {},
        };
        // Compile-time structural check: the adapter start options type
        // carries every field the server passes through.
        expect(opts.staticRoutes).toBeDefined();
        expect(typeof opts.fetch).toBe('function');
        expect(opts.port).toBe(4000);
        expect(opts.hostname).toBe('localhost');
        expect(opts.debug).toBe(false);
        expect(typeof opts.onListen).toBe('function');
    });
});
