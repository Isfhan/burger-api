/**
 * Regression test: `plugins.ts`/`providers.ts`' default export must be
 * `await`ed by the framework, not fire-and-forgotten. Found while narrowing
 * the `burger` parameter's type (see `PluginRegistrar`/`ProviderRegistrar`
 * in `src/index.ts`) — an `async` default export that awaits something
 * before calling `usePlugin()`/`provide()` used to lose the race against
 * `router.compile()`/`pluginRegistry.resolveAll()`, which ran a few lines
 * later in the same synchronous continuation. Exercises the AOT
 * (`pluginsModule`/`providersModule`) call site directly — the dev
 * filesystem-scan call site shares the same fix, verified separately by
 * the existing `plugin-macro-smoke.test.ts` integration test still passing
 * (it uses a synchronous default export, so it wouldn't have caught this).
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import type { Plugin } from '../../src/plugin/types';

declare module '../../src/context/context' {
    interface BurgerServices {
        asyncService?: string;
    }
}

function makeApp(): Burger {
    return new Burger({
        apiRoutes: [
            {
                path: '/api/ping',
                handlers: {
                    GET: (ctx) =>
                        Response.json({
                            pluginRan: (ctx as any)._asyncPluginRan === true,
                            providerValue: ctx.services?.asyncService,
                        }),
                },
            },
        ],
        // Both default exports await a macrotask before registering —
        // exactly the shape that lost the race before the `await` fix.
        pluginsModule: {
            default: async (burger: { usePlugin(plugin: Plugin): unknown }) => {
                await Bun.sleep(5);
                const plugin: Plugin = {
                    name: 'async-plugin',
                    hooks: {
                        beforeRoute: [
                            (ctx) => {
                                (ctx as any)._asyncPluginRan = true;
                            },
                        ],
                    },
                };
                burger.usePlugin(plugin);
            },
        },
        providersModule: {
            default: async (burger: {
                provide(name: string, service: unknown): unknown;
            }) => {
                await Bun.sleep(5);
                burger.provide('asyncService', 'from-async-provider');
            },
        },
    });
}

describe('plugins.ts/providers.ts async registration race', () => {
    it('an async plugins.ts default export still registers before routes compile', async () => {
        const app = makeApp();
        const fetchHandler = await app.fetchHandler();
        const res = await fetchHandler(new Request('http://t/api/ping'));
        const body = (await res.json()) as {
            pluginRan: boolean;
            providerValue: string;
        };
        expect(body.pluginRan).toBe(true);
    });

    it('an async providers.ts default export still registers before routes compile', async () => {
        const app = makeApp();
        const fetchHandler = await app.fetchHandler();
        const res = await fetchHandler(new Request('http://t/api/ping'));
        const body = (await res.json()) as {
            pluginRan: boolean;
            providerValue: string;
        };
        expect(body.providerValue).toBe('from-async-provider');
    });
});
