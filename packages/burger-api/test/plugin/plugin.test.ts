import { describe, it, expect } from 'bun:test';
import { PluginRegistry } from '../../src/plugin/registry';
import { composePluginHooks } from '../../src/plugin/composer';
import { HookChain } from '../../src/chain/chain';
import { flatten } from '../../src/chain/flattener';
import type { Plugin, ResolvedPlugin } from '../../src/plugin/types';
import type { RouteHooks, Hook, ErrorHook } from '../../src/lifecycle/types';

describe('PluginRegistry', () => {
    it('registers a plugin and resolves it', async () => {
        const reg = new PluginRegistry();
        const plugin: Plugin = {
            name: 'auth',
            hooks: {
                beforeRoute: [
                    (req) => {
                        void req;
                    },
                ],
            },
        };
        expect(reg.register(plugin)).toBe(true);
        expect(reg.has('auth')).toBe(true);
        const resolved = await reg.resolve('auth');
        expect(resolved).toBeDefined();
        expect(resolved!.name).toBe('auth');
        expect(resolved!.scope).toBe('plugin');
    });

    it('deduplicates by name + seed: same seed returns false', () => {
        const reg = new PluginRegistry();
        const plugin: Plugin = { name: 'cors', hooks: {} };
        expect(reg.register(plugin, 'plugin', 'v1')).toBe(true);
        expect(reg.register(plugin, 'plugin', 'v1')).toBe(false);
    });

    it('allows same name with different seeds', () => {
        const reg = new PluginRegistry();
        const jwt1: Plugin = { name: 'jwt', hooks: {} };
        const jwt2: Plugin = { name: 'jwt', hooks: {} };
        expect(reg.register(jwt1, 'plugin', 'user')).toBe(true);
        expect(reg.register(jwt2, 'plugin', 'admin')).toBe(true);
        expect(reg.size()).toBe(2);
    });

    it('resolves all registered plugins', async () => {
        const reg = new PluginRegistry();
        reg.register({ name: 'a', hooks: {} }, 'global');
        reg.register({ name: 'b', hooks: {} }, 'plugin');
        const all = await reg.resolveAll();
        expect(all).toHaveLength(2);
        const names = all.map((p) => p.name).sort();
        expect(names).toEqual(['a', 'b']);
    });

    it('clears all entries', () => {
        const reg = new PluginRegistry();
        reg.register({ name: 'test', hooks: {} });
        expect(reg.size()).toBe(1);
        reg.clear();
        expect(reg.size()).toBe(0);
    });
});

describe('Plugin composition', () => {
    function makePlugin(
        name: string,
        hooks: RouteHooks,
        scope: ResolvedPlugin['scope'] = 'plugin'
    ): ResolvedPlugin {
        return { name, hooks, scope };
    }

    it('composes plugin beforeRoute hooks into the chain', () => {
        const chain = new HookChain();
        const plugins = [
            makePlugin('auth', {
                beforeRoute: [() => undefined],
            }),
        ];
        composePluginHooks(chain, plugins, '/test');
        const plan = flatten(chain, '/test');
        expect(plan.beforeRoute).toHaveLength(1);
    });

    it('orders hooks: validation (global) → plugin → route (local)', () => {
        const chain = new HookChain();
        const order: string[] = [];

        // Validation (global)
        chain.add({
            stage: 'beforeRoute',
            fn: () => {
                order.push('global');
            },
            scope: 'global',
            owner: 'fw',
        });
        // Plugin (plugin scope)
        const plugins = [
            makePlugin('logger', {
                beforeRoute: [
                    () => {
                        order.push('plugin');
                    },
                ],
            }),
        ];
        composePluginHooks(chain, plugins, '/r');
        // Route (local)
        chain.addStage(
            'beforeRoute',
            [
                () => {
                    order.push('local');
                },
            ],
            'local',
            '/r'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.beforeRoute) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['plugin', 'global', 'local']);
    });

    it('composes plugin afterRoute, mapResponse, onError', () => {
        const chain = new HookChain();
        const plugins = [
            makePlugin('audit', {
                afterRoute: [() => undefined],
                mapResponse: [() => undefined],
                onError: [() => undefined] as unknown as ErrorHook[],
            }),
        ];
        composePluginHooks(chain, plugins, '/r');
        const plan = flatten(chain, '/r');
        expect(plan.afterRoute).toHaveLength(1);
        expect(plan.mapResponse).toHaveLength(1);
        expect(plan.onError).toHaveLength(1);
    });

    it('plugin onError runs after route onError (local → global → plugin)', () => {
        const chain = new HookChain();
        const order: string[] = [];

        // Route onError (local)
        chain.addStage(
            'onError',
            [
                () => {
                    order.push('local');
                    return undefined;
                },
            ] as unknown as ErrorHook[],
            'local',
            '/r'
        );
        // Plugin onError (plugin scope)
        const plugins = [
            makePlugin('monitor', {
                onError: [
                    () => {
                        order.push('plugin');
                        return undefined;
                    },
                ] as unknown as ErrorHook[],
            }),
        ];
        composePluginHooks(chain, plugins, '/r');
        // Global onError
        chain.addStage(
            'onError',
            [
                () => {
                    order.push('global');
                    return undefined;
                },
            ] as unknown as ErrorHook[],
            'global',
            'app'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.onError) {
            (h as (err: Error, req: unknown) => void)(
                new Error('t'),
                undefined
            );
        }
        expect(order).toEqual(['local', 'global', 'plugin']);
    });

    it('plugin hooks with plugin scope run before global-scoped plugin hooks', () => {
        const chain = new HookChain();
        const order: string[] = [];

        const plugins: ResolvedPlugin[] = [
            {
                name: 'g',
                hooks: {
                    beforeRoute: [
                        () => {
                            order.push('global-plugin');
                        },
                    ],
                },
                scope: 'global',
            },
            {
                name: 'p',
                hooks: {
                    beforeRoute: [
                        () => {
                            order.push('plugin-plugin');
                        },
                    ],
                },
                scope: 'plugin',
            },
        ];
        composePluginHooks(chain, plugins, '/r');
        chain.addStage(
            'beforeRoute',
            [
                () => {
                    order.push('local');
                },
            ],
            'local',
            '/r'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.beforeRoute) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['plugin-plugin', 'global-plugin', 'local']);
    });
});
