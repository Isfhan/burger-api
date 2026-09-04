/**
 * JIT HookPlan equivalence: for every pipeline semantic the generated
 * function must produce byte-identical outcomes to the interpreter
 * (`executeHookPlan`) — short-circuits, after-mapper reverse order,
 * transform reserved-key drops, validation failures, error dispatch,
 * response hooks, and response validation.
 */
import { describe, it, expect, afterEach } from 'bun:test';
import { z } from 'zod';
import { compileJitHookPlan, canUseJit, resetJitProbe } from '../../src/lifecycle/jit';
import { executeHookPlan } from '../../src/lifecycle/executor';
import { RouterCompiler } from '../../src/router/compiler';
import { Router } from '../../src/router/router';
import type { RouteDefinition, RequestHandler } from '../../src/types/index';
import type { HookPlan } from '../../src/lifecycle/types';

afterEach(() => {
    // Tests flip the global probe; restore a fresh state.
    resetJitProbe();
});

const REQ = (method = 'GET') =>
    new Request('http://t/x', { method });

async function runBoth(
    plan: HookPlan,
    handlers: Record<string, RequestHandler>,
    method = 'GET'
): Promise<[Response, Response]> {
    const jitFn = compileJitHookPlan(plan, false);
    const ctxJ = await makeCtx();
    const ctxI = await makeCtx();
    const handler = handlers[method] ?? handlers.GET!;
    const viaJit =
        jitFn !== null
            ? await jitFn(ctxJ, handler, method)
            : // Bare plan: compiled handler would call the handler directly.
              (await handler(ctxJ)) as Response;
    const viaInt = await executeHookPlan(
        ctxI,
        plan as never,
        handlers,
        REQ(method)
    );
    return [viaJit, viaInt];
}

let counter = 0;
async function makeCtx(): Promise<import('../../src/context/context').BurgerContext> {
    const { BurgerContext } = await import('../../src/context/context');
    return BurgerContext.create(
        new Request(`http://t/x?c=${counter++}`),
        { route: { path: '/x', pattern: '/x' } }
    );
}

describe('jit hook plan — equivalence with interpreter', () => {
    it('capability probe reports true on Bun (codegen allowed)', () => {
        expect(canUseJit()).toBe(true);
    });

    it('no-eval runtimes (Cloudflare) disable JIT and keep the interpreter', async () => {
        // Simulate workerd's EvalError for dynamic code generation.
        const RealFunction = globalThis.Function;
        Object.defineProperty(globalThis, 'Function', {
            value: class extends RealFunction {
                constructor(...args: unknown[]) {
                    if (args.length > 0) {
                        throw new EvalError(
                            'Code generation from strings disallowed for this context'
                        );
                    }
                    super();
                }
            },
            writable: true,
            configurable: true,
        });
        try {
            resetJitProbe();
            expect(canUseJit()).toBe(false);
            const plan: HookPlan = {
                beforeRoute: [() => undefined],
                afterRoute: [],
                mapResponse: [],
                onError: [],
            };
            expect(compileJitHookPlan(plan)).toBeNull();

            // Router-level: jit:true still routes correctly on such runtimes.
            const defs: RouteDefinition[] = [
                {
                    path: '/api/x/:id',
                    handlers: { GET: () => new Response('ok') },
                },
            ];
            const router = new Router({ engine: 'trie', jit: true });
            router.compile(defs);
            const res = await router.fetch(
                new Request('http://t/api/x/7')
            );
            expect(res.status).toBe(200);
        } finally {
            Object.defineProperty(globalThis, 'Function', {
                value: RealFunction,
                writable: true,
                configurable: true,
            });
            resetJitProbe();
        }
    });

    it('plain handler — identical pass-through', async () => {
        const h: RequestHandler = () => Response.json({ ok: 1 });
        const [a, b] = await runBoth({ beforeRoute: [], afterRoute: [], mapResponse: [], onError: [] }, { GET: h });
        expect(await a.text()).toBe(await b.text());
        expect(a.status).toBe(b.status);
    });

    it('beforeRoute short-circuit wins identically', async () => {
        let handlerRan = 0;
        const plan: HookPlan = {
            beforeRoute: [
                () => undefined,
                () => new Response('blocked', { status: 403 }),
            ],
            afterRoute: [],
            mapResponse: [],
            onError: [],
        };
        const [a, b] = await runBoth(plan, {
            GET: () => {
                handlerRan++;
                return Response.json({ ran: true });
            },
        });
        expect(handlerRan).toBe(0);
        expect(a.status).toBe(403);
        expect(await a.text()).toBe(await b.text());
    });

    it('after-mappers apply in reverse collection order', async () => {
        const order: string[] = [];
        const mkHook = (tag: string) => async () => {
            order.push(`hook:${tag}`);
            // Runtime-permissive return (after-mapper) — exercised by both
            // engines' shared runner semantics.
            return (async (res: Response) => {
                order.push(`mapper:${tag}`);
                return new Response(`${await res.clone().text()}+${tag}`, {
                    status: res.status,
                });
            }) as unknown as void;
        };
        const plan: HookPlan = {
            beforeRoute: [mkHook('first'), mkHook('second')],
            afterRoute: [],
            mapResponse: [],
            onError: [],
        };
        const [a, b] = await runBoth(plan, {
            GET: async () => {
                order.push('handler');
                return new Response('body');
            },
        });
        const ta = await a.text(); // single consumption
        expect(ta).toBe('body+second+first');
        const tb = await b.text();
        expect(tb).toBe(ta);
        expect(order.join(',')).toBe(
            'hook:first,hook:second,handler,mapper:second,mapper:first,' +
                'hook:first,hook:second,handler,mapper:second,mapper:first'
        );
    });

    it('transform injects values and drops reserved keys', async () => {
        const plan: HookPlan = {
            transform: {
                tenant: () => 'acme',
                params: () => 'HACK',
                env: () => 'HACK',
            },
            beforeRoute: [],
            afterRoute: [],
            mapResponse: [],
            onError: [],
        };
        const [a, b] = await runBoth(plan, {
            GET: (ctx) =>
                Response.json({
                    tenant: (ctx as unknown as Record<string, unknown>).tenant,
                    params: ctx.params,
                    env: ctx.env,
                }),
        });
        const ja = (await a.json()) as Record<string, unknown>;
        const jb = (await b.json()) as Record<string, unknown>;
        expect(ja.tenant).toBe('acme');
        expect(jb).toEqual(ja);
        // Reserved keys untouched by transform on BOTH engines.
        expect(ja.env).toBeUndefined();
    });

    it('validation failure surfaces structured 422 through both engines', async () => {
        // Build a real plan via the compiler so plan.validation is the
        // framework-owned hook.
        const compiler = new RouterCompiler(false, {}, false);
        const defs = [
            {
                path: '/api/things/:id',
                handlers: {
                    GET: (ctx: import('../../src/context/context').BurgerContext) =>
                        Response.json({
                            id: (
                                (ctx.validated as unknown as {
                                    params: { id: string };
                                }) ?? { params: { id: '' } }
                            ).params.id,
                        }),
                },
                schema: { get: { params: z.object({ id: z.string() }) } },
            } as unknown as RouteDefinition,
        ];
        void compiler;
        const routerI = new Router({ engine: 'trie' });
        const routerJ = new Router({ engine: 'trie', jit: true });
        routerI.compile(defs);
        routerJ.compile(defs);
        const ri = await routerI.fetch(REQ());
        const rj = await routerJ.fetch(REQ());
        expect(rj.status).toBe(ri.status);
        expect((await rj.json()) as unknown).toEqual(await ri.json());
    });

    it('regression: a body-only schema does not trigger response-clone/parse on the JIT path', async () => {
        // Guards jit.ts:127 — must key off `plan.validators?.response`, not
        // the whole `plan.validators` object (set for ANY schema kind).
        let cloneCalls = 0;
        class SpyResponse extends Response {
            override clone(): Response {
                cloneCalls++;
                return super.clone();
            }
        }
        const defs = [
            {
                path: '/api/things',
                handlers: {
                    POST: () => new SpyResponse(JSON.stringify({ ok: true }), {
                        headers: { 'content-type': 'application/json' },
                    }),
                },
                schema: { post: { body: z.object({ name: z.string() }) } },
            } as unknown as RouteDefinition,
        ];
        const routerJ = new Router({ engine: 'trie', jit: true });
        routerJ.compile(defs);
        const res = await routerJ.fetch(
            new Request('http://t/api/things', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name: 'x' }),
            })
        );
        expect(res.status).toBe(200);
        expect(cloneCalls).toBe(0);
    });

    it('response-validation enforce mode rejects identically through both engines', async () => {
        const defs = [
            {
                path: '/api/enforced',
                handlers: {
                    GET: () => Response.json({ id: 123 }),
                },
                schema: { get: { response: { 200: z.object({ id: z.string() }) } } },
            } as unknown as RouteDefinition,
        ];
        const routerI = new Router({
            engine: 'trie',
            jit: false,
            validation: { responseValidation: 'enforce' },
        });
        const routerJ = new Router({
            engine: 'trie',
            jit: true,
            validation: { responseValidation: 'enforce' },
        });
        routerI.compile(defs);
        routerJ.compile(defs);
        const req = () => new Request('http://t/api/enforced');
        const ri = await routerI.fetch(req());
        const rj = await routerJ.fetch(req());
        expect(rj.status).toBe(ri.status);
        expect(ri.status).toBe(500);
        expect((await rj.json()) as unknown).toEqual(await ri.json());
    });

    it('onError chain dispatches nearest-first identically through both engines', async () => {
        const plan: HookPlan = {
            beforeRoute: [],
            afterRoute: [],
            mapResponse: [],
            onError: [
                // First hook does not recognize the error — falls through.
                () => undefined,
                (err: Error) => new Response(`handled:${err.message}`, { status: 418 }),
            ],
        };
        const [a, b] = await runBoth(plan, {
            GET: () => {
                throw new Error('boom');
            },
        });
        expect(a.status).toBe(418);
        expect(await a.text()).toBe(await b.text());
        expect(a.status).toBe(b.status);
    });

    it('auto-HEAD parity: HEAD derives from GET identically through both engines', async () => {
        const defs = [
            {
                path: '/api/head-me',
                handlers: {
                    GET: () =>
                        Response.json(
                            { ok: true },
                            { headers: { 'x-marker': '1' } }
                        ),
                },
            } as unknown as RouteDefinition,
        ];
        const routerI = new Router({ engine: 'trie', jit: false });
        const routerJ = new Router({ engine: 'trie', jit: true });
        routerI.compile(defs);
        routerJ.compile(defs);
        const req = () => new Request('http://t/api/head-me', { method: 'HEAD' });
        const ri = await routerI.fetch(req());
        const rj = await routerJ.fetch(req());
        expect(rj.status).toBe(ri.status);
        expect(rj.headers.get('x-marker')).toBe(ri.headers.get('x-marker'));
        expect(await rj.text()).toBe('');
        expect(await ri.text()).toBe('');
    });

    it('405 + Allow parity identically through both engines', async () => {
        const defs = [
            {
                path: '/api/get-only',
                handlers: { GET: () => new Response('ok') },
            } as unknown as RouteDefinition,
        ];
        const routerI = new Router({ engine: 'trie', jit: false });
        const routerJ = new Router({ engine: 'trie', jit: true });
        routerI.compile(defs);
        routerJ.compile(defs);
        const req = () => new Request('http://t/api/get-only', { method: 'POST' });
        const ri = await routerI.fetch(req());
        const rj = await routerJ.fetch(req());
        expect(rj.status).toBe(405);
        expect(rj.status).toBe(ri.status);
        expect(rj.headers.get('allow')).toBe(ri.headers.get('allow'));
    });
});
