/**
 * Startup processing is shared: concurrent `fetchHandler()` calls must not
 * compile the same routes (or run app convention files) twice. A failed
 * startup keeps rejecting later callers with the same error.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import type { Plugin } from '../../src/plugin/types';

describe('concurrent startup', () => {
    it('two concurrent fetchHandler() calls compile routes once', async () => {
        let pluginRuns = 0;
        let providerRuns = 0;
        const app = new Burger({
            apiRoutes: [
                {
                    path: '/a',
                    handlers: { GET: () => new Response('a') },
                },
            ],
            pluginsModule: {
                default: async (burger: {
                    usePlugin(plugin: Plugin): unknown;
                }) => {
                    pluginRuns++;
                    await Bun.sleep(5);
                    burger.usePlugin({ name: 'once', hooks: {} });
                },
            },
            providersModule: {
                default: async (burger: {
                    provide(name: string, service: unknown): unknown;
                }) => {
                    providerRuns++;
                    await Bun.sleep(5);
                    burger.provide('startupOnce', true);
                },
            },
        });

        const [first, second] = await Promise.all([
            app.fetchHandler(),
            app.fetchHandler(),
        ]);

        expect(pluginRuns).toBe(1);
        expect(providerRuns).toBe(1);
        expect((await first(new Request('http://t/a'))).status).toBe(200);
        expect((await second(new Request('http://t/a'))).status).toBe(200);
    });

    it('a failed startup is retried, not cached forever', async () => {
        let pluginRuns = 0;
        const app = new Burger({
            apiRoutes: [
                {
                    path: '/a',
                    handlers: { GET: () => new Response('a') },
                },
            ],
            pluginsModule: {
                default: () => {
                    if (++pluginRuns === 1) throw new Error('transient');
                },
            },
        });

        await expect(app.fetchHandler()).rejects.toThrow('transient');

        const handler = await app.fetchHandler();
        expect(pluginRuns).toBe(2);
        expect((await handler(new Request('http://t/a'))).status).toBe(200);
    });
});
