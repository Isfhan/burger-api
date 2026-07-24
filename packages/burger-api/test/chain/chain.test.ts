import { describe, it, expect } from 'bun:test';
import { HookChain } from '../../src/chain/chain';
import { flatten } from '../../src/chain/flattener';
import type { Hook, ErrorHook } from '../../src/lifecycle/types';

describe('HookChain (Phase 4 M4)', () => {
    it('starts empty', () => {
        const chain = new HookChain();
        expect(chain.getNodes()).toHaveLength(0);
    });

    it('adds a single node', () => {
        const chain = new HookChain();
        const fn = () => undefined;
        chain.add({ stage: 'beforeHandle', fn, scope: 'local', owner: '/test' });
        expect(chain.getNodes()).toHaveLength(1);
        expect(chain.getNodes()[0].stage).toBe('beforeHandle');
        expect(chain.getNodes()[0].scope).toBe('local');
        expect(chain.getNodes()[0].owner).toBe('/test');
    });

    it('adds multiple nodes via addStage', () => {
        const chain = new HookChain();
        const fns = [() => undefined, () => new Response('ok')];
        chain.addStage('afterHandle', fns, 'global', 'app');
        expect(chain.getNodes()).toHaveLength(2);
        expect(chain.getNodes()[0].scope).toBe('global');
        expect(chain.getNodes()[1].scope).toBe('global');
    });

    it('clears all nodes', () => {
        const chain = new HookChain();
        chain.add({ stage: 'beforeHandle', fn: () => undefined, scope: 'local', owner: '/test' });
        chain.clear();
        expect(chain.getNodes()).toHaveLength(0);
    });
});

describe('Flattener (Phase 4 M4)', () => {
    it('produces empty arrays for an empty chain', () => {
        const chain = new HookChain();
        const plan = flatten(chain, '/test');
        expect(plan.beforeHandle).toHaveLength(0);
        expect(plan.afterHandle).toHaveLength(0);
        expect(plan.onResponse).toHaveLength(0);
        expect(plan.onError).toHaveLength(0);
        expect(plan.provide).toBeUndefined();
    });

    it('orders beforeHandle: global → plugin → local', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage('beforeHandle', [() => { order.push('local'); }], 'local', '/r');
        chain.addStage('beforeHandle', [() => { order.push('plugin'); }], 'plugin', 'p');
        chain.addStage('beforeHandle', [() => { order.push('global'); }], 'global', 'g');

        const plan = flatten(chain, '/r');
        expect(plan.beforeHandle).toHaveLength(3);

        for (const h of plan.beforeHandle) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['global', 'plugin', 'local']);
    });

    it('orders afterHandle: global → plugin → local', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage('afterHandle', [() => { order.push('local'); }], 'local', '/r');
        chain.addStage('afterHandle', [() => { order.push('global'); }], 'global', 'g');

        const plan = flatten(chain, '/r');
        for (const h of plan.afterHandle) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['global', 'local']);
    });

    it('orders onResponse: global → plugin → local', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage('onResponse', [() => { order.push('local'); }], 'local', '/r');
        chain.addStage('onResponse', [() => { order.push('plugin'); }], 'plugin', 'p');
        chain.addStage('onResponse', [() => { order.push('global'); }], 'global', 'g');

        const plan = flatten(chain, '/r');
        for (const h of plan.onResponse) {
            (h as (req: unknown) => void)(undefined);
        }
        expect(order).toEqual(['global', 'plugin', 'local']);
    });

    it('orders onError nearest-first: local → plugin → global', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage('onError', [
            () => { order.push('global'); return undefined; },
        ] as ErrorHook[], 'global', 'g');
        chain.addStage('onError', [
            () => { order.push('plugin'); return undefined; },
        ] as ErrorHook[], 'plugin', 'p');
        chain.addStage('onError', [
            () => { order.push('local'); return undefined; },
        ] as ErrorHook[], 'local', '/r');

        const plan = flatten(chain, '/r');
        for (const h of plan.onError) {
            (h as (err: Error, req: unknown) => void)(new Error('test'), undefined);
        }
        expect(order).toEqual(['local', 'plugin', 'global']);
    });

    it('pins global-scope validation at beforeHandle[0]', () => {
        const chain = new HookChain();
        const routeHook = () => 'route';
        const validationHook = () => 'validation';

        chain.add({ stage: 'beforeHandle', fn: validationHook, scope: 'global', owner: 'framework' });
        chain.add({ stage: 'beforeHandle', fn: routeHook, scope: 'local', owner: '/r' });

        const plan = flatten(chain, '/r');
        expect(plan.beforeHandle).toHaveLength(2);
        // The flattener groups global → local, so validation is first
        expect(plan.beforeHandle[0]).toBe(validationHook);
        expect(plan.beforeHandle[1]).toBe(routeHook);
    });

    it('preserves insertion order within the same scope', () => {
        const chain = new HookChain();
        const order: string[] = [];
        chain.addStage('beforeHandle', [
            () => { order.push('a'); },
            () => { order.push('b'); },
            () => { order.push('c'); },
        ], 'local', '/r');

        const plan = flatten(chain, '/r');
        for (const h of plan.beforeHandle) {
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

        chain.addStage('beforeHandle', [() => { before.push('bh'); }], 'local', '/r');
        chain.addStage('afterHandle', [() => { after.push('ah'); }], 'local', '/r');
        chain.addStage('onResponse', [() => { resp.push('or'); }], 'local', '/r');
        chain.addStage('onError', [() => { err.push('oe'); return undefined; }] as ErrorHook[], 'local', '/r');

        const plan = flatten(chain, '/r');
        expect(plan.beforeHandle).toHaveLength(1);
        expect(plan.afterHandle).toHaveLength(1);
        expect(plan.onResponse).toHaveLength(1);
        expect(plan.onError).toHaveLength(1);
    });
});
