import { describe, it, expect } from 'bun:test';
import { executeHookPlan } from '../../src/lifecycle/executor';
import type { HookPlan } from '../../src/lifecycle/types';
import { BurgerContext } from '../../src/context/context';

describe('transform (Phase 4 M3)', () => {
    it('injects transformed values onto the context before the handler', async () => {
        const plan: HookPlan = {
            beforeRoute: [],
            afterRoute: [],
            mapResponse: [],
            onError: [],
            transform: {
                user: () => ({ id: 1, name: 'alice' }),
                tenant: (req) => req.headers.get('X-Tenant') ?? 'default',
            },
        };
        const ctx = BurgerContext.create(
            new Request('http://h/test', { headers: { 'X-Tenant': 'acme' } }),
            { route: { path: '/test', pattern: '/test' } }
        );
        let captured: Record<string, unknown> = {};
        await executeHookPlan(ctx, plan, {
            GET: (req) => {
                const r = req as unknown as Record<string, unknown>;
                captured = { user: r.user, tenant: r.tenant };
                return new Response('ok', { status: 200 });
            },
        }, new Request('http://h/test'));
        expect(captured.user).toEqual({ id: 1, name: 'alice' });
        expect(captured.tenant).toBe('acme');
    });

    it('does not run transform when beforeRoute short-circuits', async () => {
        let transformRan = false;
        const plan: HookPlan = {
            beforeRoute: [
                () => new Response('blocked', { status: 403 }),
            ],
            afterRoute: [],
            mapResponse: [],
            onError: [],
            transform: {
                user: () => {
                    transformRan = true;
                    return { id: 1 };
                },
            },
        };
        const ctx = BurgerContext.create(
            new Request('http://h/test'),
            { route: { path: '/test', pattern: '/test' } }
        );
        const res = await executeHookPlan(ctx, plan, {
            GET: () => new Response('ok', { status: 200 }),
        }, new Request('http://h/test'));
        expect(res.status).toBe(403);
        expect(transformRan).toBe(false);
    });

    it('allows route-level transform to reference values from global transform', async () => {
        const plan: HookPlan = {
            beforeRoute: [],
            afterRoute: [],
            mapResponse: [],
            onError: [],
            transform: {
                base: () => 10,
                total: (req) => {
                    const ctx = req as unknown as Record<string, unknown>;
                    return (ctx.base as number) + 5;
                },
            },
        };
        const ctx = BurgerContext.create(
            new Request('http://h/test'),
            { route: { path: '/test', pattern: '/test' } }
        );
        let total: unknown;
        await executeHookPlan(ctx, plan, {
            GET: (req) => {
                const r = req as unknown as Record<string, unknown>;
                total = r.total;
                return new Response('ok', { status: 200 });
            },
        }, new Request('http://h/test'));
        expect(total).toBe(15);
    });

    it('injects values after beforeRoute but before the handler', async () => {
        const order: string[] = [];
        const plan: HookPlan = {
            beforeRoute: [
                (req) => {
                    const r = req as unknown as Record<string, unknown>;
                    // transform should NOT have run yet
                    expect(r.user).toBeUndefined();
                    order.push('beforeRoute');
                },
            ],
            afterRoute: [],
            mapResponse: [],
            onError: [],
            transform: {
                user: () => {
                    order.push('transform');
                    return { id: 1 };
                },
            },
        };
        const ctx = BurgerContext.create(
            new Request('http://h/test'),
            { route: { path: '/test', pattern: '/test' } }
        );
        await executeHookPlan(ctx, plan, {
            GET: (req) => {
                const r = req as unknown as Record<string, unknown>;
                expect(r.user).toEqual({ id: 1 });
                order.push('handler');
                return new Response('ok', { status: 200 });
            },
        }, new Request('http://h/test'));
        expect(order).toEqual(['beforeRoute', 'transform', 'handler']);
    });
});
