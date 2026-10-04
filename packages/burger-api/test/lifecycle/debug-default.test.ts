/**
 * Debug output is opt-in: stack/cause render only when `debug: true` or
 * `NODE_ENV === 'development'`. onRequest errors and handler errors must
 * resolve that flag identically.
 */
import { describe, it, expect, spyOn } from 'bun:test';
import { Burger } from '../../src/index';
import type { BurgerContext } from '../../src/context/context';

async function withNodeEnv(
    value: string | undefined,
    fn: () => Promise<void>
): Promise<void> {
    const original = process.env.NODE_ENV;
    if (value === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = value;
    try {
        await fn();
    } finally {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
    }
}

function makeApp(debug?: boolean): Burger {
    return new Burger({
        debug,
        apiRoutes: [
            {
                path: '/api/handler',
                handlers: {
                    GET: () => {
                        throw new Error('handler-boom');
                    },
                },
            },
            {
                path: '/api/onreq',
                handlers: { GET: () => new Response('ok') },
            },
        ],
        globalHooks: {
            onRequest: (ctx: BurgerContext) => {
                if (new URL(ctx.url).pathname === '/api/onreq') {
                    throw new Error('onreq-boom');
                }
            },
        },
    });
}

async function bodyFor(burger: Burger, path: string): Promise<string> {
    const handler = await burger.fetchHandler();
    const res = await handler(new Request(`http://localhost${path}`));
    expect(res.status).toBe(500);
    return res.text();
}

describe('debug default resolution', () => {
    it('NODE_ENV unset: onRequest and handler 500s leak neither stack nor message', async () => {
        const errors = spyOn(console, 'error').mockImplementation(() => {});
        try {
            await withNodeEnv(undefined, async () => {
                const burger = makeApp();
                for (const path of ['/api/handler', '/api/onreq']) {
                    const text = await bodyFor(burger, path);
                    expect(text).not.toContain('stack');
                    expect(text).not.toContain('handler-boom');
                    expect(text).not.toContain('onreq-boom');
                    expect(text).toContain('Internal Server Error');
                }
            });
        } finally {
            errors.mockRestore();
        }
    });

    it('NODE_ENV=development: onRequest and handler 500s both include the stack', async () => {
        const errors = spyOn(console, 'error').mockImplementation(() => {});
        try {
            await withNodeEnv('development', async () => {
                const burger = makeApp();
                for (const path of ['/api/handler', '/api/onreq']) {
                    const text = await bodyFor(burger, path);
                    expect(text).toContain('stack');
                }
            });
        } finally {
            errors.mockRestore();
        }
    });

    it('debug: true wins in production', async () => {
        const errors = spyOn(console, 'error').mockImplementation(() => {});
        try {
            await withNodeEnv('production', async () => {
                const text = await bodyFor(makeApp(true), '/api/handler');
                expect(text).toContain('stack');
            });
        } finally {
            errors.mockRestore();
        }
    });
});
