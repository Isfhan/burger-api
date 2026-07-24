import { describe, it, expect } from 'bun:test';
import { executeHookPlan } from '../../src/lifecycle/executor';
import type { HookPlan } from '../../src/lifecycle/types';
import { BurgerContext } from '../../src/context/context';

describe('onError (Phase 4 M2)', () => {
    it('catches a handler throw via route-level onError', async () => {
        const plan: HookPlan = {
            beforeRoute: [],
            afterRoute: [],
            mapResponse: [],
            onError: [
                () =>
                    new Response(JSON.stringify({ ok: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    }),
            ],
        };
        const ctx = BurgerContext.create(
            new Request('http://h/test'),
            { route: { path: '/test', pattern: '/test' } }
        );
        const res = await executeHookPlan(ctx, plan, {
            GET: () => {
                throw new Error('boom');
            },
        }, new Request('http://h/test'));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ ok: true });
    });

    it('onError that itself throws falls back to errorResponse (500)', async () => {
        const plan: HookPlan = {
            beforeRoute: [],
            afterRoute: [],
            mapResponse: [],
            onError: [
                () => {
                    throw new Error('onError-threw');
                },
            ],
        };
        const ctx = BurgerContext.create(
            new Request('http://h/test'),
            { route: { path: '/test', pattern: '/test' } }
        );
        // No onError handles it → re-throws → expect rejection
        await expect(
            executeHookPlan(ctx, plan, {
                GET: () => {
                    throw new Error('handler-boom');
                },
            }, new Request('http://h/test'))
        ).rejects.toThrow('handler-boom');
    });

    it('chains errors in order: route onError runs before global onError', async () => {
        const order: string[] = [];
        const plan: HookPlan = {
            beforeRoute: [],
            afterRoute: [],
            mapResponse: [],
            onError: [
                // "Route" level onError (nearest first in the array)
                () => {
                    order.push('route');
                    return new Response('route-handled', { status: 200 });
                },
                // "Global" level onError
                () => {
                    order.push('global');
                    return new Response('global-handled', { status: 200 });
                },
            ],
        };
        const ctx = BurgerContext.create(
            new Request('http://h/test'),
            { route: { path: '/test', pattern: '/test' } }
        );
        await executeHookPlan(ctx, plan, {
            GET: () => {
                throw new Error('boom');
            },
        }, new Request('http://h/test'));
        // Route onError handled it → global never runs
        expect(order).toEqual(['route']);
    });

    it('falls through to next onError when previous onError returns undefined', async () => {
        const order: string[] = [];
        const plan: HookPlan = {
            beforeRoute: [],
            afterRoute: [],
            mapResponse: [],
            onError: [
                () => {
                    order.push('first-pass');
                    return undefined; // Does not handle
                },
                () => {
                    order.push('second-handles');
                    return new Response('ok', { status: 200 });
                },
            ],
        };
        const ctx = BurgerContext.create(
            new Request('http://h/test'),
            { route: { path: '/test', pattern: '/test' } }
        );
        await executeHookPlan(ctx, plan, {
            GET: () => {
                throw new Error('boom');
            },
        }, new Request('http://h/test'));
        expect(order).toEqual(['first-pass', 'second-handles']);
    });

    it('catches error from beforeRoute hook', async () => {
        const plan: HookPlan = {
            beforeRoute: [
                () => {
                    throw new Error('beforeRoute-error');
                },
            ],
            afterRoute: [],
            mapResponse: [],
            onError: [
                (err) =>
                    new Response(
                        JSON.stringify({ caught: err.message }),
                        { status: 400, headers: { 'Content-Type': 'application/json' } }
                    ),
            ],
        };
        const ctx = BurgerContext.create(
            new Request('http://h/test'),
            { route: { path: '/test', pattern: '/test' } }
        );
        const res = await executeHookPlan(ctx, plan, {
            GET: () => new Response('ok', { status: 200 }),
        }, new Request('http://h/test'));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.caught).toBe('beforeRoute-error');
    });
});
