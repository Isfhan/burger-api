/**
 * Loose trailing-slash matching removes the slash BEFORE route matching, so a
 * sibling wildcard cannot steal a `:param` match and wildcard captures never
 * end in the synthetic empty segment. Covers the fetch paths (trie + regex)
 * and Bun's native `serve()` routes, where Bun matches a wildcard before the
 * fetch fallback runs.
 */
import { describe, it, expect, afterEach } from 'bun:test';
import { Burger, toFetchHandler } from '../../src/index';
import type { BurgerContext } from '../../src/context/context';

type Engine = 'trie' | 'regex';

function makeApp(engine: Engine, withHooks = false): Burger {
    return new Burger({
        engine,
        apiRoutes: [
            {
                path: '/api/products/:id',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({ route: ':id', id: ctx.params.id }),
                },
            },
            {
                path: '/api/products/*',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({
                            route: '*',
                            wildcard: ctx.wildcardParams,
                        }),
                },
                isWildcard: true,
            },
            {
                path: '/api/files/*',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({
                            route: '*',
                            wildcard: ctx.wildcardParams,
                        }),
                },
                isWildcard: true,
            },
            {
                // Explicitly registered trailing-slash static route: its exact
                // form must win before the slash-less variants are tried.
                path: '/api/exact/',
                handlers: {
                    GET: () => Response.json({ route: 'static-slash' }),
                },
            },
        ],
        globalHooks: withHooks
            ? {
                  onRequest: (ctx: BurgerContext) => {
                      ctx.set.headers = { 'x-on': '1' };
                  },
              }
            : undefined,
    });
}

const cases: [string, Record<string, unknown>][] = [
    ['/api/products/1/', { route: ':id', id: '1' }],
    ['/api/products/1/?x=1', { route: ':id', id: '1' }],
    ['/api/products/1/2/', { route: '*', wildcard: ['1', '2'] }],
    ['/api/products/', { route: '*', wildcard: [] }],
    ['/api/files/', { route: '*', wildcard: [] }],
    ['/api/files/a/', { route: '*', wildcard: ['a'] }],
    ['/api/products/1', { route: ':id', id: '1' }],
    ['/api/exact/', { route: 'static-slash' }],
];

const apps: Burger[] = [];

afterEach(() => {
    while (apps.length > 0) apps.pop()!.getServer()?.stop();
});

describe('fetchHandler — trailing slash is removed before matching', () => {
    for (const engine of ['trie', 'regex'] as const) {
        for (const withHooks of [false, true]) {
            it(`engine=${engine} hooks=${withHooks}`, async () => {
                const app = makeApp(engine, withHooks);
                const handler = await app.fetchHandler();

                for (const [path, expected] of cases) {
                    const res = await handler(
                        new Request(`http://localhost${path}`)
                    );
                    expect(res.status).toBe(200);
                    expect(await res.json()).toEqual(expected);
                    if (withHooks) {
                        expect(res.headers.get('x-on')).toBe('1');
                    }
                }

                // The root path is never stripped.
                const root = await handler(new Request('http://localhost/'));
                expect(root.status).toBe(404);
            });
        }
    }

    it('toFetchHandler applies the same normalization', async () => {
        for (const engine of ['trie', 'regex'] as const) {
            const handler = toFetchHandler(makeApp(engine));
            for (const [path, expected] of cases) {
                const res = await handler(
                    new Request(`http://localhost${path}`)
                );
                expect(res.status).toBe(200);
                expect(await res.json()).toEqual(expected);
            }
        }
    });
});

describe('Bun serve() — native wildcard trailing slash uses the fetch dispatch', () => {
    for (const engine of ['trie', 'regex'] as const) {
        for (const withHooks of [false, true]) {
            it(`engine=${engine} hooks=${withHooks}`, async () => {
                const app = makeApp(engine, withHooks);
                apps.push(app);
                const port = 45000 + Math.floor(Math.random() * 5000);
                await app.serve(port, () => {});
                const base = `http://127.0.0.1:${port}`;

                for (const [path, expected] of cases) {
                    const res = await fetch(`${base}${path}`);
                    expect(res.status).toBe(200);
                    expect(await res.json()).toEqual(expected);
                    if (withHooks) {
                        expect(res.headers.get('x-on')).toBe('1');
                    }
                }

                const root = await fetch(`${base}/`);
                expect(root.status).toBe(404);
            });
        }
    }
});
