import { describe, it, expect } from 'bun:test';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';
import type { Hook } from '../../src/lifecycle/types';

function helloRoute(): RouteDefinition {
    return {
        path: '/api/hello',
        handlers: {
            GET: () => Response.json({ message: 'hello' }),
        },
    };
}

describe('onRequest hook (pre-routing)', () => {
    it('runs before routing and can short-circuit with a Response', async () => {
        let hookCalled = false;
        const hook: Hook = (ctx) => {
            hookCalled = true;
            if (ctx.method === 'OPTIONS') {
                return new Response(null, { status: 204 });
            }
        };

        const router = new Router();
        router.compile([helloRoute()], undefined, undefined, [hook]);

        // OPTIONS request — should short-circuit
        const optRes = await router.fetch(
            new Request('http://localhost/api/hello', { method: 'OPTIONS' })
        );
        expect(hookCalled).toBe(true);
        expect(optRes.status).toBe(204);

        // GET request — hook returns undefined, routing continues
        hookCalled = false;
        const getRes = await router.fetch(
            new Request('http://localhost/api/hello')
        );
        expect(hookCalled).toBe(true);
        expect(getRes.status).toBe(200);
    });

    it('short-circuits the entire pipeline when returning a Response', async () => {
        const blockHook: Hook = () => new Response('Blocked', { status: 403 });

        const router = new Router();
        router.compile([helloRoute()], undefined, undefined, [blockHook]);

        const res = await router.fetch(
            new Request('http://localhost/api/hello')
        );
        expect(res.status).toBe(403);
        expect(await res.text()).toBe('Blocked');
    });

    it('runs multiple onRequest hooks in order', async () => {
        const order: string[] = [];
        const hook1: Hook = () => {
            order.push('first');
        };
        const hook2: Hook = () => {
            order.push('second');
        };

        const router = new Router();
        router.compile([helloRoute()], undefined, undefined, [hook1, hook2]);

        const res = await router.fetch(
            new Request('http://localhost/api/hello')
        );
        expect(res.status).toBe(200);
        expect(order).toEqual(['first', 'second']);
    });

    it('no onRequest hooks means normal routing', async () => {
        const router = new Router();
        router.compile([helloRoute()]);

        const res = await router.fetch(
            new Request('http://localhost/api/hello')
        );
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toBe('hello');
    });

    it('onRequest receives a BurgerContext with request data', async () => {
        let capturedMethod = '';
        let capturedUrl = '';

        const inspector: Hook = (ctx) => {
            capturedMethod = ctx.method;
            capturedUrl = ctx.url;
        };

        const router = new Router();
        router.compile([helloRoute()], undefined, undefined, [inspector]);

        await router.fetch(new Request('http://localhost/api/hello'));
        expect(capturedMethod).toBe('GET');
        expect(capturedUrl).toContain('/api/hello');
    });

    it('first hook short-circuits prevents later hooks from running', async () => {
        const order: string[] = [];
        const hook1: Hook = () => {
            order.push('first');
            return new Response('early', { status: 418 });
        };
        const hook2: Hook = () => {
            order.push('second');
        };

        const router = new Router();
        router.compile([helloRoute()], undefined, undefined, [hook1, hook2]);

        const res = await router.fetch(
            new Request('http://localhost/api/hello')
        );
        expect(res.status).toBe(418);
        expect(order).toEqual(['first']);
    });
});
