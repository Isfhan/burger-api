/**
 * `plugins.ts`/`providers.ts` default exports must be awaited before routes
 * compile, so an async default export cannot lose the registration race.
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
