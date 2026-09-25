/**
 * Platform bindings (`ctx.env` / `ctx.executionCtx`) injected through the
 * WinterCG entry point and carried across the lifecycle — including
 * pre-routing `onRequest` re-binding and trie-dispatched dynamic routes.
 */
import { describe, it, expect } from 'bun:test';
import { Burger, toFetchHandler } from '../../src/index';
import { BurgerContext } from '../../src/context/context';
import type { RouteDefinition } from '../../src/types/index';

interface TestEnv {
    MY_KV: { get(key: string): string };
    API_KEY: string;
}

const env: TestEnv = {
    MY_KV: { get: (key) => `value:${key}` },
    API_KEY: 'secret',
};

const executionCtx = {
    waitUntil(promise: Promise<unknown>) {
        void promise;
    },
};

function req(path: string): Request {
    return new Request(`http://localhost${path}`);
}

describe('env / executionCtx injection', () => {
    it('binds env onto the context for static routes (direct dispatch)', async () => {
        const routes: RouteDefinition[] = [
            {
                path: '/api/kv',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({
                            key: (ctx.env as TestEnv).MY_KV.get('a'),
                        }),
                },
            },
        ];
        const burger = new Burger({ apiRoutes: routes });
        const handler = toFetchHandler(burger);
        const res = await handler(req('/api/kv'), env, executionCtx);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ key: 'value:a' });
    });

    it('binds env for dynamic routes (trie fallback dispatch)', async () => {
        const routes: RouteDefinition[] = [
            {
                path: '/api/users/:id',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({
                            id: ctx.params!.id,
                            apiKey: (ctx.env as TestEnv).API_KEY,
                        }),
                },
            },
        ];
        const burger = new Burger({ apiRoutes: routes });
        const handler = toFetchHandler(burger);
        const res = await handler(req('/api/users/42'), env, executionCtx);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: '42', apiKey: 'secret' });
    });

    it('carries env across pre-routing onRequest re-binding', async () => {
        let seenInHook: unknown;
        const routes: RouteDefinition[] = [
            {
                path: '/api/seeded',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({
                            hookSawEnv: seenInHook !== undefined,
                            handlerSeesEnv:
                                (ctx.env as TestEnv | undefined)?.API_KEY ===
                                'secret',
                            seededState: (
                                ctx as unknown as Record<string, unknown>
                            ).requestId,
                        }),
                },
                hooks: {
                    // Route-level beforeRoute runs AFTER the pre-routing
                    // context was created and bound — env must survive.
                    beforeRoute: (ctx: BurgerContext) => {
                        seenInHook = ctx.env;
                        (ctx as unknown as Record<string, unknown>).requestId =
                            'r-1';
                    },
                },
            },
        ];
        const globalOnRequest = (ctx: BurgerContext) => {
            // Pre-routing sees the env that was bound at creation time.
            expect((ctx.env as TestEnv).API_KEY).toBe('secret');
        };

        const burger = new Burger({
            apiRoutes: routes,
            globalHooks: { onRequest: globalOnRequest },
        });
        const handler = toFetchHandler(burger);
        const res = await handler(req('/api/seeded'), env, executionCtx);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.hookSawEnv).toBe(true);
        expect(body.handlerSeesEnv).toBe(true);
        expect(body.seededState).toBe('r-1');
    });

    it('exposes waitUntil through ctx.executionCtx', async () => {
        let waited = 0;
        const routes: RouteDefinition[] = [
            {
                path: '/api/wait',
                handlers: {
                    GET: (ctx: BurgerContext) => {
                        ctx.executionCtx?.waitUntil(Promise.resolve(1));
                        return Response.json({ ok: true });
                    },
                },
            },
        ];
        const trackingCtx = {
            waitUntil() {
                waited++;
            },
        };
        const burger = new Burger({ apiRoutes: routes });
        const handler = toFetchHandler(burger);
        await handler(req('/api/wait'), undefined, trackingCtx);
        expect(waited).toBe(1);
    });

    it('leaves env undefined when the runtime provides none (Bun serve)', async () => {
        const routes: RouteDefinition[] = [
            {
                path: '/api/noenv',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({ hasEnv: ctx.env !== undefined }),
                },
            },
        ];
        const burger = new Burger({ apiRoutes: routes });
        const handler = toFetchHandler(burger);
        const res = await handler(req('/api/noenv'));
        expect(await res.json()).toEqual({ hasEnv: false });
    });

    it('transform hooks cannot clobber reserved keys (env, executionCtx)', async () => {
        const routes: RouteDefinition[] = [
            {
                path: '/api/guarded',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({
                            stillEnv: (ctx.env as TestEnv).API_KEY,
                        }),
                },
                hooks: {
                    transform: {
                        env: () => ({ hijacked: true }),
                        executionCtx: () => 'hijacked',
                    },
                },
            },
        ];
        const burger = new Burger({ apiRoutes: routes });
        const handler = toFetchHandler(burger);
        const res = await handler(req('/api/guarded'), env);
        expect(await res.json()).toEqual({ stillEnv: 'secret' });
    });
});
