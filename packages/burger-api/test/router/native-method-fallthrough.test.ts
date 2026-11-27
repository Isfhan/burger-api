/**
 * Bun's native routes must answer a missing method on a matched path with the
 * same 405 + Allow as the fetch path — never fall through to a less specific
 * route (a wildcard, or a `:param` route that captures the static segment).
 */
import { describe, it, expect, afterEach } from 'bun:test';
import { Burger } from '../../src/index';
import type { BurgerContext } from '../../src/context/context';
import { freePort } from '../free-port';

const apps: Burger[] = [];

afterEach(() => {
    while (apps.length > 0) apps.pop()!.getServer()?.stop();
});

function makeApp(withHooks: boolean): Burger {
    const app = new Burger({
        apiRoutes: [
            {
                path: '/a/b',
                handlers: { POST: () => new Response('post-a-b') },
            },
            {
                path: '/a/*',
                handlers: { GET: () => new Response('wildcard') },
            },
            {
                path: '/users/me',
                handlers: { POST: () => new Response('me') },
            },
            {
                path: '/users/:id',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({ id: ctx.params.id }),
                },
            },
        ],
        globalHooks: withHooks
            ? {
                  onRequest: (ctx: BurgerContext) => {
                      ctx.set.headers = { 'x-on': '1' };
                  },
                  afterRoute: () => {},
              }
            : undefined,
    });
    apps.push(app);
    return app;
}

async function serve(app: Burger): Promise<string> {
    const port = freePort();
    await app.serve(port, () => {});
    return `http://127.0.0.1:${port}`;
}

describe('Bun native routes match the fetch path for missing methods', () => {
    for (const withHooks of [false, true]) {
        it(`405 on the matched path instead of falling through (hooks=${withHooks})`, async () => {
            const bun = makeApp(withHooks);
            const fetchApp = makeApp(withHooks);
            const base = await serve(bun);
            const fetchHandler = await fetchApp.fetchHandler();

            const cases: [string, string][] = [
                ['GET', '/a/b'],
                ['DELETE', '/a/b'],
                ['HEAD', '/a/b'],
                ['OPTIONS', '/a/b'],
                ['GET', '/users/me'],
                ['GET', '/users/42'],
                ['POST', '/users/me'],
                ['POST', '/a/b'],
            ];

            for (const [method, path] of cases) {
                const native = await fetch(`${base}${path}`, { method });
                const fallback = await fetchHandler(
                    new Request(`http://localhost${path}`, { method })
                );

                expect(native.status).toBe(fallback.status);
                expect(native.headers.get('allow')).toBe(
                    fallback.headers.get('allow')
                );
                expect(native.headers.get('x-on')).toBe(
                    fallback.headers.get('x-on')
                );
                if (method !== 'HEAD') {
                    expect(await native.text()).toBe(await fallback.text());
                }
            }
        });
    }

    it('the static path wins over a wildcard for an unsupported method', async () => {
        const app = makeApp(false);
        const base = await serve(app);
        const res = await fetch(`${base}/a/b`);
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('POST, OPTIONS');
        expect(await res.text()).toContain('Supported methods: POST, OPTIONS');
    });

    it('a static path wins over a :param route for an unsupported method', async () => {
        const app = makeApp(false);
        const base = await serve(app);
        const res = await fetch(`${base}/users/me`);
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('POST, OPTIONS');
    });
});
