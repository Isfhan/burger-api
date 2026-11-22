/**
 * `onRequest` mappers (global and plugin) read `ctx.params` /
 * `ctx.wildcardParams`; the access analysis must account for them even when
 * the route handler does not read params.
 */
import { describe, it, expect, afterEach } from 'bun:test';
import { Burger } from '../../src/index';
import type { BurgerContext } from '../../src/context/context';

const apps: Burger[] = [];

afterEach(() => {
    while (apps.length > 0) apps.pop()!.getServer()?.stop();
});

function makeApp(seen: Record<string, unknown>): Burger {
    const app = new Burger({
        apiRoutes: [
            {
                path: '/u/:id',
                handlers: { GET: () => new Response('ok') },
            },
            {
                path: '/w/*',
                handlers: { GET: () => new Response('ok') },
            },
        ],
        globalHooks: {
            onRequest: (ctx: BurgerContext) => {
                return (res: Response) => {
                    seen.params = ctx.params;
                    seen.wildcard = ctx.wildcardParams;
                    return res;
                };
            },
        },
    });
    app.usePlugin({
        name: 'param-plugin',
        hooks: {
            onRequest: (ctx: BurgerContext) => {
                return (res: Response) => {
                    seen.pluginParams = ctx.params;
                    seen.pluginWildcard = ctx.wildcardParams;
                    return res;
                };
            },
        },
    });
    apps.push(app);
    return app;
}

describe('onRequest mappers see params on both dispatch paths', () => {
    it('global and plugin mappers receive params via fetchHandler', async () => {
        const seen: Record<string, unknown> = {};
        const handler = await makeApp(seen).fetchHandler();
        await handler(new Request('http://localhost/u/42'));
        expect(seen.params).toEqual({ id: '42' });
        expect(seen.pluginParams).toEqual({ id: '42' });

        await handler(new Request('http://localhost/w/a/b'));
        expect(seen.wildcard).toEqual(['a', 'b']);
        expect(seen.pluginWildcard).toEqual(['a', 'b']);
    });

    it('global and plugin mappers receive params via Bun native routes', async () => {
        const seen: Record<string, unknown> = {};
        const app = makeApp(seen);
        const port = 44000 + Math.floor(Math.random() * 5000);
        await app.serve(port, () => {});
        const base = `http://127.0.0.1:${port}`;

        await fetch(`${base}/u/42`);
        expect(seen.params).toEqual({ id: '42' });
        expect(seen.pluginParams).toEqual({ id: '42' });

        await fetch(`${base}/w/a/b`);
        expect(seen.wildcard).toEqual(['a', 'b']);
        expect(seen.pluginWildcard).toEqual(['a', 'b']);
    });
});
