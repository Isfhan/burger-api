/**
 * Regression tests for the hands-on tester findings (IDs in the test names
 * match the fix report / CHANGELOG): AOT global hooks, hook scope ordering,
 * JIT/interpreter parity, handler-return checks, error logging, content-type
 * gating, trailing slashes, auto OPTIONS/HEAD, onRequest coverage, plugin
 * dedupe, ctx.json caching, coercion, OpenAPI shape, and more.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import { Burger, HTTPError } from '../../src/index';
import type { BurgerContext } from '../../src/context/context';
import { Router } from '../../src/router/router';
import { PluginRegistry } from '../../src/plugin/registry';
import { buildPlan, apply } from '../../src/validation/coerce';
import type { ErrorHook } from '../../src/lifecycle/types';

type Ctx = BurgerContext & { order?: string[] };

function push(ctx: BurgerContext, label: string): void {
    const c = ctx as Ctx;
    (c.order ??= []).push(label);
}

/** afterRoute/mapResponse hook that records its label into a header. */
function tag(label: string) {
    return () => (res: Response) => {
        const headers = new Headers(res.headers);
        const prev = headers.get('x-order');
        headers.set('x-order', prev ? `${prev},${label}` : label);
        return new Response(res.body, { status: res.status, headers });
    };
}

async function fetchVia(
    burger: Burger,
    url: string,
    init?: RequestInit
): Promise<Response> {
    const handler = await burger.fetchHandler();
    return handler(new Request(`http://localhost${url}`, init));
}

const spies: { mockRestore(): void }[] = [];
afterEach(() => {
    while (spies.length) spies.pop()!.mockRestore();
});
function quiet(method: 'error' | 'warn') {
    const spy = spyOn(console, method).mockImplementation(() => {});
    spies.push(spy);
    return spy;
}

describe('C2 — AOT applies every global hook with global scope', () => {
    for (const jit of [true, false]) {
        it(`transform/beforeRoute/afterRoute/mapResponse/onError (jit=${jit})`, async () => {
            const burger = new Burger({
                jit,
                apiRoutes: [
                    {
                        path: '/api/x',
                        handlers: {
                            GET: (ctx) =>
                                Response.json({
                                    order: (ctx as Ctx).order,
                                    tenant: (ctx as unknown as { tenant: string })
                                        .tenant,
                                }),
                        },
                        hooks: {
                            beforeRoute: (ctx) => push(ctx, 'route'),
                            afterRoute: tag('route-after'),
                        },
                    },
                    {
                        path: '/api/boom',
                        handlers: {
                            GET: () => {
                                throw new Error('boom');
                            },
                        },
                    },
                ],
                globalHooks: {
                    transform: { tenant: () => 'acme' },
                    beforeRoute: (ctx: BurgerContext) => push(ctx, 'global'),
                    afterRoute: tag('global-after'),
                    mapResponse: tag('global-map'),
                    onError: () => new Response('handled', { status: 599 }),
                },
            });
            const res = await fetchVia(burger, '/api/x');
            expect(await res.json()).toEqual({
                order: ['global', 'route'],
                tenant: 'acme',
            });
            // Response hooks: Route → Global (nearest-first), then mapResponse.
            expect(res.headers.get('x-order')).toBe(
                'route-after,global-after,global-map'
            );
            const err = await fetchVia(burger, '/api/boom');
            expect(err.status).toBe(599);
        });
    }

    it('dev (filesystem) and AOT produce the same hook order', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-parity-'));
        try {
            const w = (rel: string, src: string) => {
                const full = path.join(root, rel);
                mkdirSync(path.dirname(full), { recursive: true });
                writeFileSync(full, src);
            };
            const tagSrc = (l: string) =>
                `() => (res) => { const h = new Headers(res.headers); const p = h.get('x-order'); h.set('x-order', p ? p + ',${l}' : '${l}'); return new Response(res.body, { status: res.status, headers: h }); }`;
            w(
                'hooks.ts',
                `export const beforeRoute = (ctx) => { (ctx.order ??= []).push('global'); };
export const afterRoute = ${tagSrc('global')};
export const onError = [() => undefined, () => new Response('global-error', { status: 500 })];`
            );
            w(
                'api/x/route.ts',
                `export function GET(ctx) { if (ctx.query.fail) throw new Error('x'); return Response.json(ctx.order); }`
            );
            w(
                'api/x/hooks.ts',
                `export const beforeRoute = (ctx) => { (ctx.order ??= []).push('route'); };
export const afterRoute = ${tagSrc('route')};
export const onError = () => new Response('route-error', { status: 500 });`
            );
            const dev = new Burger({ apiDir: path.join(root, 'api') });
            const aot = new Burger({
                apiRoutes: [
                    {
                        path: '/api/x',
                        handlers: {
                            GET: (await import(path.join(root, 'api/x/route.ts'))).GET,
                        },
                        hooks: await import(path.join(root, 'api/x/hooks.ts')),
                    },
                ],
                globalHooks: await import(path.join(root, 'hooks.ts')),
            });
            for (const app of [dev, aot]) {
                const res = await fetchVia(app, '/api/x');
                expect(await res.json()).toEqual(['global', 'route']);
                expect(res.headers.get('x-order')).toBe('route,global');
                const err = await fetchVia(app, '/api/x?fail=1');
                expect(await err.text()).toBe('route-error');
            }
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('H2/M2 — scope ordering and no array mutation', () => {
    it('response + error hooks run Route → Global → Plugin; user arrays untouched', async () => {
        const routeErrors: ErrorHook[] = [
            () => undefined,
            () => new Response('route-2', { status: 500 }),
        ];
        const snapshot = [...routeErrors];
        const make = () => {
            const burger = new Burger({
                apiRoutes: [
                    {
                        path: '/api/x',
                        handlers: { GET: () => new Response('ok') },
                        hooks: {
                            afterRoute: [tag('route-1'), tag('route-2')],
                            onError: routeErrors,
                        },
                    },
                ],
                globalHooks: { afterRoute: tag('global') },
            });
            burger.usePlugin({ name: 'p', hooks: { afterRoute: tag('plugin') } });
            return burger;
        };
        for (let i = 0; i < 2; i++) {
            const res = await fetchVia(make(), '/api/x');
            expect(res.headers.get('x-order')).toBe(
                'route-1,route-2,global,plugin'
            );
        }
        expect(routeErrors).toEqual(snapshot);
    });
});

describe('H1 — JIT matches the interpreter on beforeRoute short-circuit', () => {
    it('short-circuit still runs collected mappers + afterRoute + mapResponse', async () => {
        const bodies: string[] = [];
        for (const jit of [true, false]) {
            const burger = new Burger({
                jit,
                apiRoutes: [
                    {
                        path: '/api/x',
                        handlers: { GET: () => new Response('handler') },
                        hooks: {
                            beforeRoute: [
                                tag('mapper'),
                                () => new Response('denied', { status: 401 }),
                                () => {
                                    throw new Error('never runs');
                                },
                            ],
                            afterRoute: tag('after'),
                            mapResponse: tag('map'),
                        },
                    },
                ],
            });
            const res = await fetchVia(burger, '/api/x');
            expect(res.status).toBe(401);
            bodies.push(`${await res.text()}|${res.headers.get('x-order')}`);
        }
        expect(bodies[0]).toBe('denied|mapper,after,map');
        expect(bodies[0]).toBe(bodies[1]!);
    });
});

describe('H3 — native dynamic routes keep the onRequest context', () => {
    it('state seeded by onRequest reaches the handler', async () => {
        const router = new Router();
        router.compile(
            [
                {
                    path: '/api/u/:id',
                    handlers: {
                        GET: (ctx) =>
                            Response.json({
                                id: ctx.params.id,
                                seeded: (ctx as unknown as { seeded?: string })
                                    .seeded,
                            }),
                    },
                },
            ],
            undefined,
            undefined,
            [
                (ctx) => {
                    (ctx as unknown as { seeded: string }).seeded = 'yes';
                },
            ]
        );
        const native = router.nativeRoutes()['/api/u/:id']!;
        // Bun invokes native route handlers with (request, server).
        const res = await native(
            new Request('http://localhost/api/u/7'),
            { requestIP: () => null } as never
        );
        expect(await res.json()).toEqual({ id: '7', seeded: 'yes' });
    });
});

describe('H5/H6 — non-Response returns and unhandled errors', () => {
    it('H6: a handler returning a plain object → 500 with a clear message (dev) and a log', async () => {
        const errors = quiet('error');
        const burger = new Burger({
            debug: true,
            apiRoutes: [
                {
                    path: '/api/plain',
                    handlers: { GET: (() => ({ a: 1 })) as never },
                },
            ],
        });
        const res = await fetchVia(burger, '/api/plain');
        expect(res.status).toBe(500);
        const body = (await res.json()) as { detail: string };
        expect(body.detail).toBe(
            'GET /api/plain returned object; route handlers must return a Response'
        );
        expect(errors).toHaveBeenCalled();
    });

    it('H6: production hides the message', async () => {
        quiet('error');
        const burger = new Burger({
            debug: false,
            apiRoutes: [
                { path: '/api/u', handlers: { GET: (() => undefined) as never } },
            ],
        });
        const res = await fetchVia(burger, '/api/u');
        expect(res.status).toBe(500);
        expect(((await res.json()) as { detail: string }).detail).toBe(
            'Internal Server Error'
        );
    });

    it('H5: unhandled 5xx errors are logged with method and path; handled ones are not', async () => {
        const errors = quiet('error');
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/boom',
                    handlers: {
                        GET: () => {
                            throw new Error('kaboom');
                        },
                    },
                },
                {
                    path: '/api/nf',
                    handlers: {
                        GET: () => {
                            throw new HTTPError(404, 'nope');
                        },
                    },
                },
            ],
        });
        await fetchVia(burger, '/api/nf');
        expect(errors).not.toHaveBeenCalled();
        await fetchVia(burger, '/api/boom');
        expect(errors).toHaveBeenCalled();
        const [line, err] = errors.mock.calls[0]!;
        expect(String(line)).toContain('GET /api/boom');
        expect((err as Error).message).toBe('kaboom');
    });
});

describe('H4/M1/M13 — body handling', () => {
    const route = (handler: (ctx: BurgerContext) => Promise<Response>, withSchema = true) =>
        new Burger({
            apiRoutes: [
                {
                    path: '/api/b',
                    handlers: { POST: handler },
                    schema: withSchema
                        ? { POST: { body: z.object({ name: z.string() }) } }
                        : undefined,
                },
            ],
        });
    const post = (b: Burger, body: string, type = 'application/json') =>
        fetchVia(b, '/api/b', {
            method: 'POST',
            headers: { 'content-type': type },
            body,
        });

    it('H4: text/plain with a declared body schema → 415 problem+json', async () => {
        let reached = false;
        const res = await post(
            route(async () => {
                reached = true;
                return new Response('x');
            }),
            'name=x',
            'text/plain'
        );
        expect(res.status).toBe(415);
        expect(reached).toBe(false);
    });

    it('M1: ctx.json() after body validation returns the parsed body', async () => {
        const res = await post(
            route(async (ctx) => Response.json(await ctx.json())),
            '{"name":"a"}'
        );
        expect(await res.json()).toEqual({ name: 'a' });
    });

    it('M13: malformed JSON read by an unvalidated handler → 400', async () => {
        const res = await post(
            route(async (ctx) => Response.json(await ctx.json()), false),
            '{bad'
        );
        expect(res.status).toBe(400);
        expect(res.headers.get('content-type')).toBe('application/problem+json');
        expect(((await res.json()) as { title: string }).title).toBe(
            'Bad Request'
        );
    });
});

describe('M3 — async onError is a valid ErrorHook', () => {
    it('awaits an async onError', async () => {
        const onError: ErrorHook = async () =>
            new Response('async-handled', { status: 503 });
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/e',
                    handlers: {
                        GET: () => {
                            throw new Error('x');
                        },
                    },
                    hooks: { onError },
                },
            ],
        });
        const res = await fetchVia(burger, '/api/e');
        expect(res.status).toBe(503);
    });
});

describe('M8 — trailing slashes', () => {
    const burger = () =>
        new Burger({
            apiRoutes: [
                { path: '/api/products', handlers: { GET: () => new Response('list') } },
                {
                    path: '/api/products/:id',
                    handlers: { GET: (ctx) => new Response(`id=${ctx.params.id}`) },
                },
            ],
        });
    it('/api/products/1/ matches the :id route', async () => {
        expect(await (await fetchVia(burger(), '/api/products/1/')).text()).toBe('id=1');
    });
    it('/api/products/ never binds :id to ""', async () => {
        expect(await (await fetchVia(burger(), '/api/products/')).text()).toBe('list');
    });
});

describe('M10 — onRequest covers OpenAPI/docs and assets', () => {
    it('runs global onRequest for /openapi.json and embedded assets', async () => {
        const seen: string[] = [];
        const burger = new Burger({
            apiRoutes: [{ path: '/api/x', handlers: { GET: () => new Response('x') } }],
            globalHooks: {
                onRequest: (ctx: BurgerContext) => {
                    seen.push(new URL(ctx.url).pathname);
                },
            },
            assetRoutes: [
                { path: '/assets/a.txt', contentType: 'text/plain', data: btoa('hi') },
            ],
        });
        expect((await fetchVia(burger, '/openapi.json')).status).toBe(200);
        const asset = await fetchVia(burger, '/assets/a.txt');
        expect(await asset.text()).toBe('hi');
        expect(seen).toEqual(['/openapi.json', '/assets/a.txt']);
    });
});

describe('M11/L6 — auto OPTIONS and HEAD', () => {
    it('GET-only route answers OPTIONS 204 + Allow, skipping auth beforeRoute', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/g',
                    handlers: { GET: () => new Response('hello world') },
                    hooks: { beforeRoute: () => new Response('no', { status: 401 }) },
                },
            ],
        });
        const res = await fetchVia(burger, '/api/g', { method: 'OPTIONS' });
        expect(res.status).toBe(204);
        expect(res.headers.get('allow')).toBe('GET, OPTIONS');
        const doc = (await (await fetchVia(burger, '/openapi.json')).json()) as {
            paths: Record<string, Record<string, unknown>>;
        };
        expect(doc.paths['/api/g']!.options).toBeUndefined();
    });

    it('auto-HEAD reports GET content-length', async () => {
        const burger = new Burger({
            apiRoutes: [{ path: '/api/h', handlers: { GET: () => new Response('hello world') } }],
        });
        const res = await fetchVia(burger, '/api/h', { method: 'HEAD' });
        expect(res.headers.get('content-length')).toBe('11');
        expect(await res.text()).toBe('');
    });
});

describe('M5/B3 — OpenAPI request bodies and AOT uppercase schema keys', () => {
    it('documents input-side bodies and accepts GET/POST keys from AOT namespaces', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/items',
                    handlers: { POST: () => new Response('ok') },
                    schema: {
                        POST: {
                            body: z.object({
                                name: z.string(),
                                qty: z.number().default(1),
                            }),
                        },
                    },
                    openapi: { POST: { summary: 'Create' } } as never,
                },
            ],
        });
        const doc = (await (await fetchVia(burger, '/openapi.json')).json()) as any;
        const op = doc.paths['/api/items'].post;
        expect(op.summary).toBe('Create');
        const schema = op.requestBody.content['application/json'].schema;
        expect(schema.required).toEqual(['name']);
        expect(schema.additionalProperties).toBeUndefined();
        // Validation also runs for the uppercase key.
        const bad = await fetchVia(burger, '/api/items', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        });
        expect(bad.status).toBe(422);
    });
});

describe('M6/M7 — response validation enforce', () => {
    const make = (debug: boolean, config?: Record<string, unknown>) =>
        new Burger({
            debug,
            validation: config ? {} : { responseValidation: 'enforce' },
            apiRoutes: [
                {
                    path: '/api/r',
                    handlers: { GET: () => Response.json({ id: 1 }) },
                    schema: { GET: { response: { 200: z.object({ id: z.string() }) } } },
                    hooks: { afterRoute: tag('after') },
                    config,
                },
            ],
        });
    it('M6: production answers a generic problem+json 500 and still runs afterRoute', async () => {
        quiet('error');
        const res = await fetchVia(make(false), '/api/r');
        expect(res.status).toBe(500);
        expect(res.headers.get('content-type')).toBe('application/problem+json');
        expect(res.headers.get('x-order')).toBe('after');
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.detail).toBe('Internal Server Error');
        expect(body.errors).toBeUndefined();
    });
    it('M6: dev includes the issues', async () => {
        quiet('error');
        const body = (await (await fetchVia(make(true), '/api/r')).json()) as Record<string, unknown>;
        expect(body.errors).toBeDefined();
    });
    it('M7: config.ts responseValidation overrides the global mode per route', async () => {
        quiet('error');
        const res = await fetchVia(make(false, { responseValidation: 'enforce' }), '/api/r');
        expect(res.status).toBe(500);
    });
});

describe('M12 — unknown convention exports warn', () => {
    it('warns for a typo in global hooks and onRequest in route hooks', async () => {
        const warn = quiet('warn');
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/x',
                    handlers: { GET: () => new Response('x') },
                    hooks: { onRequest: () => undefined } as never,
                },
            ],
            globalHooks: { beforeRout: () => undefined },
        });
        await burger.fetchHandler();
        const text = warn.mock.calls.map((c) => String(c[0])).join('\n');
        expect(text).toContain('"beforeRout"');
        expect(text).toContain('onRequest runs before routing');
    });
});

describe('H7 — plugin factories', () => {
    it('keeps two anonymous factories and warns on a real duplicate', async () => {
        const warn = quiet('warn');
        const reg = new PluginRegistry();
        reg.register(() => ({ name: 'a', hooks: {} }));
        reg.register(() => ({ name: 'b', hooks: {} }));
        reg.register(() => ({ name: 'a', hooks: {} }));
        const names = (await reg.resolveAll()).map((p) => p.name);
        expect(names).toEqual(['a', 'b']);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

describe('W1 — onRequest mappers', () => {
    it('a short-circuit keeps earlier mappers; mappers run in onion order', async () => {
        const burger = new Burger({
            apiRoutes: [{ path: '/api/x', handlers: { GET: () => new Response('x') } }],
            globalHooks: {
                onRequest: [
                    tag('outer'),
                    tag('inner'),
                    (ctx: BurgerContext) =>
                        new URL(ctx.url).searchParams.has('limit')
                            ? new Response('slow down', { status: 429 })
                            : undefined,
                ],
            },
        });
        const ok = await fetchVia(burger, '/api/x');
        expect(ok.headers.get('x-order')).toBe('inner,outer');
        const limited = await fetchVia(burger, '/api/x?limit=1');
        expect(limited.status).toBe(429);
        expect(limited.headers.get('x-order')).toBe('inner,outer');
    });
});

describe('W2 — ctx.ip', () => {
    it('reports the socket address under serve() and undefined via fetchHandler', async () => {
        const burger = new Burger({
            apiRoutes: [
                { path: '/api/ip', handlers: { GET: (ctx) => Response.json({ ip: ctx.ip ?? null }) } },
                { path: '/api/ip/:x', handlers: { GET: (ctx) => Response.json({ ip: ctx.ip ?? null }) } },
            ],
        });
        expect(await (await fetchVia(burger, '/api/ip')).json()).toEqual({ ip: null });
        const port = 43000 + Math.floor(Math.random() * 1000);
        await burger.serve(port, () => {});
        try {
            for (const p of ['/api/ip', '/api/ip/1']) {
                const res = await fetch(`http://127.0.0.1:${port}${p}`);
                expect(((await res.json()) as { ip: string }).ip).toContain('127.0.0.1');
            }
        } finally {
            burger.getServer()?.stop();
        }
    });
});

describe('L1/L3/L8/B1/serve — small fixes', () => {
    it('L1: thrown objects with a status get the status phrase as title', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/o',
                    handlers: {
                        GET: () => {
                            throw { status: 404, message: 'gone' };
                        },
                    },
                },
            ],
        });
        const body = (await (await fetchVia(burger, '/api/o')).json()) as { title: string };
        expect(body.title).toBe('Not Found');
    });

    it('L3: apiPrefix "" mounts routes at the root', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-prefix-'));
        try {
            mkdirSync(path.join(root, 'hello'), { recursive: true });
            writeFileSync(
                path.join(root, 'hello', 'route.ts'),
                `export const GET = () => new Response('hi');`
            );
            const burger = new Burger({ apiDir: root, apiPrefix: '' });
            expect(await (await fetchVia(burger, '/hello')).text()).toBe('hi');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('L8: coercion handles repeated query keys and "1"/"0" booleans', () => {
        const plan = buildPlan(
            z.object({ tag: z.array(z.number()), on: z.boolean(), one: z.array(z.string()) }),
            'query'
        )!;
        expect(apply(plan, { tag: ['1', '2'], on: '1', one: 'x' })).toEqual(
            Object.assign(Object.create(null), { tag: [1, 2], on: true, one: ['x'] })
        );
        expect(apply(plan, { tag: '3', on: '0', one: ['a'] }).on).toBe(false);
    });

    it('B1: fetchHandler serves prebuilt page routes', async () => {
        const burger = new Burger({
            apiRoutes: [{ path: '/api/x', handlers: { GET: () => new Response('x') } }],
            pageRoutes: [{ path: '/about', handler: () => new Response('<h1>about</h1>') }],
        });
        expect(await (await fetchVia(burger, '/about')).text()).toBe('<h1>about</h1>');
    });

    it('serve() rejects an invalid port with a clear error', async () => {
        const burger = new Burger({
            apiRoutes: [{ path: '/api/x', handlers: { GET: () => new Response('x') } }],
        });
        await expect(burger.serve(70000)).rejects.toThrow('Invalid port 70000');
    });
});

describe('Convention directory defaults (filesystem mode)', () => {
    it('mounts <BURGER_API_APP_DIR>/api when apiDir is not configured', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-conv-'));
        const prev = process.env.BURGER_API_APP_DIR;
        try {
            mkdirSync(path.join(root, 'api', 'hello'), { recursive: true });
            writeFileSync(
                path.join(root, 'api', 'hello', 'route.ts'),
                `export const GET = () => new Response('conv');`
            );
            process.env.BURGER_API_APP_DIR = root;
            const burger = new Burger({});
            expect(await (await fetchVia(burger, '/api/hello')).text()).toBe('conv');
        } finally {
            if (prev === undefined) delete process.env.BURGER_API_APP_DIR;
            else process.env.BURGER_API_APP_DIR = prev;
            rmSync(root, { recursive: true, force: true });
        }
    });
});

