/**
 * onRequest errors route through the same `onError` chain as every other
 * request error. A throwing onError hook is logged, then the original error
 * renders.
 */
import { describe, it, expect, spyOn } from 'bun:test';
import { Burger } from '../../src/index';

async function fetchVia(burger: Burger, path: string): Promise<Response> {
    const handler = await burger.fetchHandler();
    return handler(new Request(`http://localhost${path}`));
}

describe('onRequest errors reach onError', () => {
    it('a global onError hook handles a throwing global onRequest', async () => {
        const burger = new Burger({
            debug: false,
            apiRoutes: [
                { path: '/api/x', handlers: { GET: () => new Response('ok') } },
            ],
            globalHooks: {
                onRequest: () => {
                    throw new Error('onreq-boom');
                },
                onError: () =>
                    new Response('handled-global', { status: 599 }),
            },
        });
        const res = await fetchVia(burger, '/api/x');
        expect(res.status).toBe(599);
        expect(await res.text()).toBe('handled-global');
    });

    it('a plugin onError hook handles a throwing plugin onRequest', async () => {
        const burger = new Burger({
            debug: false,
            apiRoutes: [
                { path: '/api/x', handlers: { GET: () => new Response('ok') } },
            ],
        });
        burger.usePlugin({
            name: 'p',
            hooks: {
                onRequest: () => {
                    throw new Error('onreq-boom');
                },
                onError: () => new Response('handled-plugin', { status: 598 }),
            },
        });
        const res = await fetchVia(burger, '/api/x');
        expect(res.status).toBe(598);
        expect(await res.text()).toBe('handled-plugin');
    });

    it('logs a throwing onError hook and renders the original error', async () => {
        const errors = spyOn(console, 'error').mockImplementation(() => {});
        try {
            const burger = new Burger({
                debug: false,
                apiRoutes: [
                    {
                        path: '/api/x',
                        handlers: { GET: () => new Response('ok') },
                    },
                ],
                globalHooks: {
                    onRequest: () => {
                        throw new Error('original-boom');
                    },
                    onError: () => {
                        throw new Error('onError-broke');
                    },
                },
            });
            const res = await fetchVia(burger, '/api/x');
            expect(res.status).toBe(500);
            const logged = errors.mock.calls
                .map((call) => call.map(String).join(' '))
                .join('\n');
            expect(logged).toContain('onError-broke');
        } finally {
            errors.mockRestore();
        }
    });
});
