/**
 * `config.auth === false` bypass tests for the ecosystem auth plugins.
 * Each plugin respects `auth: false` / `auth: { required: false }` from
 * `config.ts` and returns 401 otherwise.
 */
import { describe, it, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Burger } from '../../src/index';
import { apiKey } from '../../../../ecosystem/plugins/api-key/api-key';
import { basicAuth } from '../../../../ecosystem/plugins/basic-auth/basic-auth';
import { jwtAuth } from '../../../../ecosystem/plugins/jwt-auth/jwt-auth';
import { session } from '../../../../ecosystem/plugins/session/session';
import type { Plugin } from '../../src/plugin/types';
import type { BurgerContext } from '../../src/context/context';

async function run(plugin: Plugin, path: string, init?: RequestInit): Promise<Response> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api/guarded',
                handlers: { GET: () => Response.json({ ok: true }) },
                openapi: {},
            },
            {
                path: '/api/open',
                handlers: { GET: () => Response.json({ ok: true }) },
                config: { auth: false },
                openapi: {},
            },
            {
                path: '/api/relaxed',
                handlers: { GET: () => Response.json({ ok: true }) },
                config: { auth: { required: false } },
                openapi: {},
            },
        ],
    });
    burger.usePlugin(plugin);
    const handler = await burger.fetchHandler();
    return handler(new Request(`http://localhost${path}`, init));
}

describe('config.auth === false bypass (ecosystem auth plugins)', () => {
    it('api-key: 401 without key, 200 when auth: false or required: false', async () => {
        const plugin = apiKey({ keys: ['test-key'] });
        expect((await run(plugin, '/api/guarded')).status).toBe(401);
        expect((await run(plugin, '/api/open')).status).toBe(200);
        expect((await run(plugin, '/api/relaxed')).status).toBe(200);
        expect(
            (
                await run(plugin, '/api/guarded', {
                    headers: { 'X-API-Key': 'test-key' },
                })
            ).status
        ).toBe(200);
    });

    it('basic-auth: 401 without credentials, 200 when auth disabled', async () => {
        const plugin = basicAuth({
            validate: async (username, password) =>
                username === 'admin' && password === 'secret'
                    ? { id: '1', username: 'admin' }
                    : null,
        });
        expect((await run(plugin, '/api/guarded')).status).toBe(401);
        expect((await run(plugin, '/api/open')).status).toBe(200);
        expect((await run(plugin, '/api/relaxed')).status).toBe(200);
        expect(
            (
                await run(plugin, '/api/guarded', {
                    headers: {
                        Authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}`,
                    },
                })
            ).status
        ).toBe(200);
    });

    it('jwt-auth: 401 without token, 200 when auth disabled', async () => {
        const plugin = jwtAuth({ secret: 'test-secret-0123456789abcdef0123456789abcdef' });
        expect((await run(plugin, '/api/guarded')).status).toBe(401);
        expect((await run(plugin, '/api/open')).status).toBe(200);
        expect((await run(plugin, '/api/relaxed')).status).toBe(200);
    });

    it('session: 401 without session, 200 when auth disabled', async () => {
        const plugin = session();
        expect((await run(plugin, '/api/guarded')).status).toBe(401);
        expect((await run(plugin, '/api/open')).status).toBe(200);
        expect((await run(plugin, '/api/relaxed')).status).toBe(200);
    });
});

describe('per-method route config (config.ts method exports)', () => {
    const secret = 'test-secret-0123456789abcdef0123456789abcdef';
    const mixedRoute = {
        path: '/api/mixed',
        handlers: {
            GET: () => Response.json({ ok: 'get' }),
            POST: () => Response.json({ ok: 'post' }),
        },
        config: { auth: false, POST: { auth: { required: true } } },
        openapi: {},
    };

    it('AOT: jwt-auth protects POST while GET stays public in one route', async () => {
        const burger = new Burger({ apiRoutes: [mixedRoute] });
        burger.usePlugin(jwtAuth({ secret }));
        const handler = await burger.fetchHandler();

        const get = await handler(new Request('http://localhost/api/mixed'));
        expect(get.status).toBe(200);

        const post = await handler(
            new Request('http://localhost/api/mixed', { method: 'POST' })
        );
        expect(post.status).toBe(401);
    });

    it('AOT: ctx.config is the merged object for the request method', async () => {
        const seen: Record<string, unknown> = {};
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/mixed',
                    handlers: {
                        GET: (ctx: BurgerContext) => {
                            seen.get = ctx.config;
                            return Response.json({ ok: true });
                        },
                        POST: (ctx: BurgerContext) => {
                            seen.post = ctx.config;
                            return Response.json({ ok: true });
                        },
                    },
                    config: {
                        auth: false,
                        cache: 30,
                        POST: { auth: { required: true } },
                    },
                    openapi: {},
                },
            ],
        });
        const handler = await burger.fetchHandler();
        await handler(new Request('http://localhost/api/mixed'));
        await handler(
            new Request('http://localhost/api/mixed', { method: 'POST' })
        );

        expect(seen.get).toEqual({ auth: false, cache: 30 });
        expect(seen.post).toEqual({
            auth: { required: true },
            cache: 30,
        });
    });

    it('AOT: default-only config keeps its object identity on ctx.config', async () => {
        const config = { auth: false };
        let seen: unknown;
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/plain',
                    handlers: {
                        GET: (ctx: BurgerContext) => {
                            seen = ctx.config;
                            return Response.json({ ok: true });
                        },
                    },
                    config,
                    openapi: {},
                },
            ],
        });
        const handler = await burger.fetchHandler();
        await handler(new Request('http://localhost/api/plain'));

        expect(seen).toBe(config);
    });

    // Only uppercase keys are method overrides: plain route-wide options
    // named like a method (`options`, `delete`) must stay route-wide.
    it('AOT: lowercase method-like keys stay route-wide options', async () => {
        const config = { options: { depth: 2 }, delete: 'soft' };
        let seen: unknown;
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/opts',
                    handlers: {
                        POST: (ctx: BurgerContext) => {
                            seen = ctx.config;
                            return Response.json({ ok: true });
                        },
                    },
                    config,
                    openapi: {},
                },
            ],
        });
        const handler = await burger.fetchHandler();
        await handler(new Request('http://localhost/api/opts', { method: 'POST' }));

        expect(seen).toBe(config);
    });

    it('dev (live scanning): default public, POST protected by config.ts', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-config-auth-'));
        try {
            const dir = path.join(root, 'api', 'mixed');
            mkdirSync(dir, { recursive: true });
            writeFileSync(
                path.join(dir, 'route.ts'),
                `export function GET() { return Response.json({ ok: 'get' }); }
export function POST() { return Response.json({ ok: 'post' }); }`
            );
            writeFileSync(
                path.join(dir, 'config.ts'),
                `export default { auth: false };
export const POST = { auth: { required: true } };`
            );

            const burger = new Burger({ apiDir: path.join(root, 'api') });
            burger.usePlugin(jwtAuth({ secret }));
            const handler = await burger.fetchHandler();

            const get = await handler(
                new Request('http://localhost/api/mixed')
            );
            expect(get.status).toBe(200);

            const post = await handler(
                new Request('http://localhost/api/mixed', {
                    method: 'POST',
                })
            );
            expect(post.status).toBe(401);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
