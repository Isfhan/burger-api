import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';

const addHeader =
    (name: string, value: string) => () => (res: Response) => {
        res.headers.set(name, value);
        return res;
    };

describe('global/plugin response hooks on every response', () => {
    it('adds a global mapResponse header to a 404 (fetchHandler)', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/ok',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
            globalHooks: { mapResponse: addHeader('x-global', 'yes') },
        });
        const handler = await burger.fetchHandler();
        const res = await handler(new Request('http://localhost/nope'));
        expect(res.status).toBe(404);
        expect(res.headers.get('x-global')).toBe('yes');
    });

    it('runs global afterRoute and mapResponse on a 404 exactly once each', async () => {
        let after = 0;
        let map = 0;
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/ok',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
            globalHooks: {
                afterRoute: () => {
                    after++;
                },
                mapResponse: () => {
                    map++;
                },
            },
        });
        const handler = await burger.fetchHandler();
        await handler(new Request('http://localhost/nope'));
        expect(after).toBe(1);
        expect(map).toBe(1);

        after = 0;
        map = 0;
        await handler(new Request('http://localhost/api/ok'));
        expect(after).toBe(1);
        expect(map).toBe(1);
    });

    it('adds a plugin mapResponse header to a 404', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/ok',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
        }).usePlugin({
            name: 'p',
            hooks: { mapResponse: addHeader('x-plugin', 'yes') },
        });
        const handler = await burger.fetchHandler();
        const res = await handler(new Request('http://localhost/nope'));
        expect(res.status).toBe(404);
        expect(res.headers.get('x-plugin')).toBe('yes');
    });

    it('adds the header to a 405', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/only-get',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
            globalHooks: { mapResponse: addHeader('x-global', 'yes') },
        });
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/only-get', { method: 'POST' })
        );
        expect(res.status).toBe(405);
        expect(res.headers.get('x-global')).toBe('yes');
    });

    it('adds the header to auto-OPTIONS', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/only-get',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
            globalHooks: { mapResponse: addHeader('x-global', 'yes') },
        });
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/only-get', {
                method: 'OPTIONS',
            })
        );
        expect(res.status).toBe(204);
        expect(res.headers.get('x-global')).toBe('yes');
    });

    it('adds the header to an error rendered by onError', async () => {
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
            ],
            globalHooks: { mapResponse: addHeader('x-global', 'yes') },
        });
        const handler = await burger.fetchHandler();
        const res = await handler(new Request('http://localhost/api/boom'));
        expect(res.status).toBe(500);
        expect(res.headers.get('x-global')).toBe('yes');
    });

    it('applies ctx.set from onRequest to a 404', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/ok',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
            globalHooks: {
                onRequest: (ctx: any) => {
                    ctx.set.headers['x-onrequest'] = 'set';
                },
            },
        });
        const handler = await burger.fetchHandler();
        const res = await handler(new Request('http://localhost/nope'));
        expect(res.status).toBe(404);
        expect(res.headers.get('x-onrequest')).toBe('set');
    });

    it('runs global mapResponse for pages, assets, docs and openapi.json', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/ok',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
            pageRoutes: [
                { path: '/about', handler: () => new Response('about') },
            ],
            assetRoutes: [
                { path: '/assets/a.txt', contentType: 'text/plain', data: '' },
            ],
            globalHooks: { mapResponse: addHeader('x-global', 'yes') },
        });
        const handler = await burger.fetchHandler();
        for (const path of ['/about', '/assets/a.txt', '/docs', '/openapi.json']) {
            const res = await handler(new Request(`http://localhost${path}`));
            expect(res.headers.get('x-global')).toBe('yes');
        }
    });

    it('does not run route-level mapResponse on a 404 or 405', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/route-hook',
                    handlers: { GET: () => Response.json({ ok: true }) },
                    hooks: {
                        mapResponse: addHeader('x-route', 'yes'),
                    },
                },
            ],
            globalHooks: { mapResponse: addHeader('x-global', 'yes') },
        });
        const handler = await burger.fetchHandler();

        const missing = await handler(
            new Request('http://localhost/api/missing')
        );
        expect(missing.headers.get('x-global')).toBe('yes');
        expect(missing.headers.get('x-route')).toBeNull();

        const notAllowed = await handler(
            new Request('http://localhost/api/route-hook', { method: 'POST' })
        );
        expect(notAllowed.status).toBe(405);
        expect(notAllowed.headers.get('x-global')).toBe('yes');
        expect(notAllowed.headers.get('x-route')).toBeNull();

        const matched = await handler(
            new Request('http://localhost/api/route-hook')
        );
        expect(matched.headers.get('x-route')).toBe('yes');
    });

    it('adds the header to a 404 on the Bun serve path', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/ok',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
            globalHooks: { mapResponse: addHeader('x-global', 'yes') },
        });
        const port = 45000 + Math.floor(Math.random() * 500);
        await burger.serve(port, () => {});
        try {
            const res = await fetch(`http://127.0.0.1:${port}/nope`);
            expect(res.status).toBe(404);
            expect(res.headers.get('x-global')).toBe('yes');
        } finally {
            burger.getServer()?.stop();
        }
    });
});
