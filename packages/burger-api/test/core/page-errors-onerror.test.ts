/**
 * Errors thrown by page / asset handlers must run the global + plugin
 * `onError` chain and then the global response hooks, exactly like API routes.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { Burger } from '../../src/index';

const apps: Burger[] = [];
let quiet: { mockRestore(): void };

afterEach(() => {
    while (apps.length > 0) apps.pop()!.getServer()?.stop();
    quiet?.mockRestore();
});

function makeApp(withAfter: boolean): Burger {
    const app = new Burger({
        apiRoutes: [
            {
                path: '/api/x',
                handlers: {
                    GET: () => {
                        throw new Error('api boom');
                    },
                },
            },
        ],
        pageRoutes: [
            {
                path: '/page',
                handler: () => {
                    throw new Error('page boom');
                },
            },
        ],
        assetRoutes: [
            {
                path: '/assets/a.txt',
                contentType: 'text/plain',
                data: btoa('hi'),
            },
        ],
        globalHooks: {
            onError: (error: Error) =>
                new Response(`custom onError: ${error.message}`, {
                    status: 503,
                }),
            ...(withAfter
                ? {
                      afterRoute: () => {},
                  }
                : {}),
        },
    });
    apps.push(app);
    return app;
}

describe('page and asset errors use onError', () => {
    for (const withAfter of [false, true]) {
        it(`page errors reach onError (afterRoute=${withAfter})`, async () => {
            quiet = spyOn(console, 'error').mockImplementation(() => {});
            const handler = await makeApp(withAfter).fetchHandler();
            const api = await handler(new Request('http://localhost/api/x'));
            expect(api.status).toBe(503);
            expect(await api.text()).toBe('custom onError: api boom');

            const page = await handler(new Request('http://localhost/page'));
            expect(page.status).toBe(503);
            expect(await page.text()).toBe('custom onError: page boom');
        });
    }

    it('page errors reach onError on Bun serve() too', async () => {
        quiet = spyOn(console, 'error').mockImplementation(() => {});
        const app = makeApp(true);
        const port = 44000 + Math.floor(Math.random() * 5000);
        await app.serve(port, () => {});
        const res = await fetch(`http://127.0.0.1:${port}/page`);
        expect(res.status).toBe(503);
        expect(await res.text()).toBe('custom onError: page boom');
    });

    it('a plugin onError handles page errors', async () => {
        quiet = spyOn(console, 'error').mockImplementation(() => {});
        const app = new Burger({
            pageRoutes: [
                {
                    path: '/page',
                    handler: () => {
                        throw new Error('plugin page boom');
                    },
                },
            ],
        });
        apps.push(app);
        app.usePlugin({
            name: 'page-errors',
            hooks: {
                onError: () =>
                    new Response('plugin handled', { status: 503 }),
            },
        });
        const handler = await app.fetchHandler();
        const res = await handler(new Request('http://localhost/page'));
        expect(res.status).toBe(503);
        expect(await res.text()).toBe('plugin handled');
    });
});
