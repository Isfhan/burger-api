import { describe, it, expect } from 'bun:test';
import { MacroRegistry } from '../../src/plugin/macro';
import { composePluginHooks } from '../../src/plugin/composer';
import { HookChain } from '../../src/chain/chain';
import { flatten } from '../../src/chain/flattener';
import type { MacroFn } from '../../src/plugin/types';

describe('MacroRegistry', () => {
    it('registers and checks a macro', () => {
        const reg = new MacroRegistry();
        reg.register('auth', () => ({ beforeRoute: [() => undefined] }));
        expect(reg.has('auth')).toBe(true);
        expect(reg.has('missing')).toBe(false);
    });

    it('expands a registered macro into RouteHooks', () => {
        const reg = new MacroRegistry();
        reg.register('auth', () => ({
            beforeRoute: [() => 'auth-check'],
        }));
        const hooks = reg.expand('auth');
        expect(hooks).toBeDefined();
        expect(hooks!.beforeRoute).toHaveLength(1);
    });

    it('returns undefined for unknown macro', () => {
        const reg = new MacroRegistry();
        expect(reg.expand('nope')).toBeUndefined();
    });

    it('expandAll returns ResolvedPlugin entries with plugin scope', () => {
        const reg = new MacroRegistry();
        reg.register('a', () => ({ beforeRoute: [() => 'a'] }));
        reg.register('b', () => ({ beforeRoute: [() => 'b'] }));
        const result = reg.expandAll();
        expect(result).toHaveLength(2);
        for (const entry of result) {
            expect(entry.scope).toBe('plugin');
            expect(entry.hooks).toBeDefined();
        }
    });

    it('clear removes all macros', () => {
        const reg = new MacroRegistry();
        reg.register('x', () => ({}));
        expect(reg.size()).toBe(1);
        reg.clear();
        expect(reg.size()).toBe(0);
    });
});

describe('Macro hook composition', () => {
    it('expanded macro hooks are composed into the chain alongside plugins', () => {
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

        // Macro expanded hooks (treated as plugin scope)
        const macroPlugins = [
            {
                name: 'auth-macro',
                hooks: {
                    beforeRoute: [
                        () => {
                            order.push('macro');
                        },
                    ],
                },
                scope: 'plugin' as const,
            },
        ];
        composePluginHooks(chain, macroPlugins, '/r');

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
        expect(order).toEqual(['macro', 'global', 'local']);
    });

    it('macro and plugin hooks interleave at the same scope', () => {
        const chain = new HookChain();
        const order: string[] = [];

        const allPlugins = [
            {
                name: 'plugin-a',
                hooks: {
                    beforeRoute: [
                        () => {
                            order.push('plugin-a');
                        },
                    ],
                },
                scope: 'plugin' as const,
            },
            {
                name: 'macro-a',
                hooks: {
                    beforeRoute: [
                        () => {
                            order.push('macro-a');
                        },
                    ],
                },
                scope: 'plugin' as const,
            },
            {
                name: 'plugin-b',
                hooks: {
                    beforeRoute: [
                        () => {
                            order.push('plugin-b');
                        },
                    ],
                },
                scope: 'plugin' as const,
            },
        ];
        composePluginHooks(chain, allPlugins, '/r');
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
        // Preserves insertion order within the same scope
        expect(order).toEqual(['plugin-a', 'macro-a', 'plugin-b', 'local']);
    });
});
