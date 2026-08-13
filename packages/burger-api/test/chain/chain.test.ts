import { describe, it, expect } from 'bun:test';
import { HookChain } from '../../src/chain/chain';
import { flatten } from '../../src/chain/flattener';
import type { Hook, ErrorHook } from '../../src/lifecycle/types';

describe('HookChain', () => {
    it('starts empty', () => {
        const chain = new HookChain();
        expect(chain.getNodes()).toHaveLength(0);
    });

    it('rejects hooks on the wrong stage at compile time', () => {
        const chain = new HookChain();
        const onError: ErrorHook = () => undefined;
        // @ts-expect-error ErrorHook is not a ForwardHook — onError hooks
        // only belong on the 'onError' stage
        chain.addStage('beforeRoute', [onError], 'local', '/r');
        // The compile error is the contract; the call itself still executes
        // at runtime (types do not affect behavior).
        expect(chain.getNodes()).toHaveLength(1);
    });

    it('adds a single node', () => {
        const chain = new HookChain();
        const fn = () => undefined;
        chain.add({ stage: 'beforeRoute', fn, scope: 'local', owner: '/test' });
        expect(chain.getNodes()).toHaveLength(1);
        expect(chain.getNodes()[0].stage).toBe('beforeRoute');
        expect(chain.getNodes()[0].scope).toBe('local');
        expect(chain.getNodes()[0].owner).toBe('/test');
    });

    it('adds multiple nodes via addStage', () => {
        const chain = new HookChain();
        const fns = [() => undefined, () => new Response('ok')];
        chain.addStage('afterRoute', fns, 'global', 'app');
        expect(chain.getNodes()).toHaveLength(2);
        expect(chain.getNodes()[0].scope).toBe('global');
        expect(chain.getNodes()[1].scope).toBe('global');
    });

    it('clears all nodes', () => {
        const chain = new HookChain();
        chain.add({
            stage: 'beforeRoute',
            fn: () => undefined,
            scope: 'local',
            owner: '/test',
        });
        chain.clear();
        expect(chain.getNodes()).toHaveLength(0);
    });
});

describe('Flattener', () => {
    it('produces empty arrays for an empty chain', () => {
        const chain = new HookChain();
        const plan = flatten(chain, '/test');
        expect(plan.beforeRoute).toHaveLength(0);
        expect(plan.afterRoute).toHaveLength(0);
        expect(plan.mapResponse).toHaveLength(0);
        expect(plan.onError).toHaveLength(0);
        expect(plan.transform).toBeUndefined();
    });

    it('orders beforeRoute: plugin → global → local', () => {
        const chain = new HookChain();
        const order: string[] = [];
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
        chain.addStage(
            'beforeRoute',
            [
                () => {
                    order.push('plugin');
                },
            ],
            'plugin',
            'p'
        );
        chain.addStage(
            'beforeRoute',
            [
                () => {
                    order.push('global');
                },
            ],
            'global',
            'g'
        );

        const plan = flatten(chain, '/r');
        expect(plan.beforeRoute).toHaveLength(3);

        for (const h of plan.beforeRoute) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['plugin', 'global', 'local']);
    });

    it('orders beforeRoute with framework scope: framework → plugin → global → local', () => {
        const chain = new HookChain();
        const order: string[] = [];
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
        chain.addStage(
            'beforeRoute',
            [
                () => {
                    order.push('plugin');
                },
            ],
            'plugin',
            'p'
        );
        chain.addStage(
            'beforeRoute',
            [
                () => {
                    order.push('global');
                },
            ],
            'global',
            'g'
        );
        chain.addStage(
            'beforeRoute',
            [
                () => {
                    order.push('framework');
                },
            ],
            'framework',
            'fw'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.beforeRoute) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['framework', 'plugin', 'global', 'local']);
    });

    it('orders afterRoute with framework scope: local → global → plugin → framework', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage(
            'afterRoute',
            [
                () => {
                    order.push('framework');
                },
            ],
            'framework',
            'fw'
        );
        chain.addStage(
            'afterRoute',
            [
                () => {
                    order.push('local');
                },
            ],
            'local',
            '/r'
        );
        chain.addStage(
            'afterRoute',
            [
                () => {
                    order.push('plugin');
                },
            ],
            'plugin',
            'p'
        );
        chain.addStage(
            'afterRoute',
            [
                () => {
                    order.push('global');
                },
            ],
            'global',
            'g'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.afterRoute) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['local', 'global', 'plugin', 'framework']);
    });

    it('orders mapResponse reversed: local → global → plugin', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage(
            'mapResponse',
            [
                () => {
                    order.push('local');
                },
            ],
            'local',
            '/r'
        );
        chain.addStage(
            'mapResponse',
            [
                () => {
                    order.push('plugin');
                },
            ],
            'plugin',
            'p'
        );
        chain.addStage(
            'mapResponse',
            [
                () => {
                    order.push('global');
                },
            ],
            'global',
            'g'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.mapResponse) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['local', 'global', 'plugin']);
    });

    it('orders mapResponse with framework scope: local → global → plugin → framework', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage(
            'mapResponse',
            [
                () => {
                    order.push('framework');
                },
            ],
            'framework',
            'fw'
        );
        chain.addStage(
            'mapResponse',
            [
                () => {
                    order.push('local');
                },
            ],
            'local',
            '/r'
        );
        chain.addStage(
            'mapResponse',
            [
                () => {
                    order.push('plugin');
                },
            ],
            'plugin',
            'p'
        );
        chain.addStage(
            'mapResponse',
            [
                () => {
                    order.push('global');
                },
            ],
            'global',
            'g'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.mapResponse) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['local', 'global', 'plugin', 'framework']);
    });

    it('orders onError nearest-first: local → global → plugin', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage(
            'onError',
            [
                () => {
                    order.push('global');
                    return undefined;
                },
            ] as ErrorHook[],
            'global',
            'g'
        );
        chain.addStage(
            'onError',
            [
                () => {
                    order.push('plugin');
                    return undefined;
                },
            ] as ErrorHook[],
            'plugin',
            'p'
        );
        chain.addStage(
            'onError',
            [
                () => {
                    order.push('local');
                    return undefined;
                },
            ] as ErrorHook[],
            'local',
            '/r'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.onError) {
            (h as (err: Error, req: unknown) => void)(
                new Error('test'),
                undefined
            );
        }
        expect(order).toEqual(['local', 'global', 'plugin']);
    });

    it('orders onError with framework scope: local → global → plugin → framework', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage(
            'onError',
            [
                () => {
                    order.push('framework');
                    return undefined;
                },
            ] as ErrorHook[],
            'framework',
            'fw'
        );
        chain.addStage(
            'onError',
            [
                () => {
                    order.push('local');
                    return undefined;
                },
            ] as ErrorHook[],
            'local',
            '/r'
        );
        chain.addStage(
            'onError',
            [
                () => {
                    order.push('plugin');
                    return undefined;
                },
            ] as ErrorHook[],
            'plugin',
            'p'
        );
        chain.addStage(
            'onError',
            [
                () => {
                    order.push('global');
                    return undefined;
                },
            ] as ErrorHook[],
            'global',
            'g'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.onError) {
            (h as (err: Error, req: unknown) => void)(
                new Error('test'),
                undefined
            );
        }
        expect(order).toEqual(['local', 'global', 'plugin', 'framework']);
    });

    it('pins global-scope validation at beforeRoute[0]', () => {
        const chain = new HookChain();
        const routeHook: () => Response | void | undefined = () => undefined;
        const validationHook: () => Response | void | undefined = () => undefined;

        chain.add({
            stage: 'beforeRoute',
            fn: validationHook,
            scope: 'global',
            owner: 'framework',
        });
        chain.add({
            stage: 'beforeRoute',
            fn: routeHook,
            scope: 'local',
            owner: '/r',
        });

        const plan = flatten(chain, '/r');
        expect(plan.beforeRoute).toHaveLength(2);
        // The flattener groups global → local, so validation is first
        expect(plan.beforeRoute[0]).toBe(validationHook);
        expect(plan.beforeRoute[1]).toBe(routeHook);
    });

    it('preserves insertion order within the same scope', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage(
            'beforeRoute',
            [
                () => {
                    order.push('a');
                },
                () => {
                    order.push('b');
                },
                () => {
                    order.push('c');
                },
            ],
            'local',
            '/r'
        );

        const plan = flatten(chain, '/r');
        for (const h of plan.beforeRoute) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['a', 'b', 'c']);
    });

    it('handles mixed stages in a single chain', () => {
        const chain = new HookChain();
        const before: string[] = [];
        const after: string[] = [];
        const resp: string[] = [];
        const err: string[] = [];

        chain.addStage(
            'beforeRoute',
            [
                () => {
                    before.push('bh');
                },
            ],
            'local',
            '/r'
        );
        chain.addStage(
            'afterRoute',
            [
                () => {
                    after.push('ah');
                },
            ],
            'local',
            '/r'
        );
        chain.addStage(
            'mapResponse',
            [
                () => {
                    resp.push('or');
                },
            ],
            'local',
            '/r'
        );
        chain.addStage(
            'onError',
            [
                () => {
                    err.push('oe');
                    return undefined;
                },
            ] as ErrorHook[],
            'local',
            '/r'
        );

        const plan = flatten(chain, '/r');
        expect(plan.beforeRoute).toHaveLength(1);
        expect(plan.afterRoute).toHaveLength(1);
        expect(plan.mapResponse).toHaveLength(1);
        expect(plan.onError).toHaveLength(1);
    });
});
