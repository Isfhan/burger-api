/**
 * Logger hook: path-based `skip`, body cloning, request ID exposure, and
 * whole-millisecond durations.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import type { ForwardHook } from '../../src/lifecycle/types';
import { createLogger } from '../../../../ecosystem/hooks/logger/logger';
import type { BurgerContext } from '../../src/context/context';

function makeBurger(
    logger: ReturnType<typeof createLogger>,
    handler: (ctx: BurgerContext) => Response | Promise<Response> = () =>
        Response.json({ ok: true })
) {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/health',
                handlers: { GET: handler, POST: handler },
                openapi: {},
            },
            {
                path: '/api/health',
                handlers: { GET: handler, POST: handler },
                openapi: {},
            },
            {
                path: '/api/users',
                handlers: { GET: handler, POST: handler },
                openapi: {},
            },
        ],
    });
    burger.usePlugin({
        name: 'logger-test',
        hooks: { beforeRoute: logger as unknown as ForwardHook },
    });
    return burger;
}

async function request(
    burger: Burger,
    url: string,
    init?: RequestInit
): Promise<Response> {
    const handler = await burger.fetchHandler();
    return handler(new Request(url, init));
}

describe('logger hook', () => {
    it('skip string matches the pathname, independent of the query string', async () => {
        const logged: string[] = [];
        const burger = makeBurger(
            createLogger({ skip: '/health', logFn: (m) => logged.push(m) })
        );

        await request(burger, 'http://localhost/health?verbose=1');
        expect(logged).toHaveLength(0);

        await request(burger, 'http://localhost/api/users');
        expect(logged).toHaveLength(1);
    });

    it('skip regex is tested against the pathname, not the full URL', async () => {
        const logged: string[] = [];
        const burger = makeBurger(
            createLogger({ skip: /^\/health/, logFn: (m) => logged.push(m) })
        );

        await request(burger, 'http://localhost/health?a=1');
        await request(burger, 'http://localhost/api/health');
        expect(logged).toHaveLength(1);
    });

    it('logBody clones the request and leaves the body for the handler', async () => {
        const logged: string[] = [];
        const burger = makeBurger(
            createLogger({ logBody: true, logFn: (m) => logged.push(m) }),
            async (ctx) =>
                Response.json({ length: (await ctx.text()).length })
        );

        const res = await request(burger, 'http://localhost/api/health', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"a":1}',
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ length: 7 });
        expect(logged).toHaveLength(1);
    });

    it('exposes the generated request ID on ctx.requestId', async () => {
        const logger = createLogger({ logFn: () => {} });
        const burger = makeBurger(logger, (ctx) =>
            Response.json({ id: ctx.requestId ?? null })
        );

        const res = await request(burger, 'http://localhost/health');
        const data = (await res.json()) as { id: string | null };
        expect(typeof data.id).toBe('string');
    });

    it('reports durations in whole milliseconds', async () => {
        const logged: string[] = [];
        const burger = makeBurger(
            createLogger({
                formatter: (info) => String(info.duration),
                logFn: (m) => logged.push(m),
            })
        );

        await request(burger, 'http://localhost/health');
        expect(logged).toHaveLength(1);
        expect(/^\d+$/.test(logged[0]!)).toBe(true);
    });
});
