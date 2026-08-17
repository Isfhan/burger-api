/**
 * Error rendering hardening: garbage throws cannot crash the server or
 * leak internals, and thrown objects survive through the executor.
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { Burger } from '../../src/index';
import { executeHookPlan } from '../../src/lifecycle/executor';
import type { HookPlan } from '../../src/lifecycle/types';
import { BurgerContext } from '../../src/context/context';
import type { FetchHandler } from '../../src/types/index';

const throwingRoutes = [
    {
        path: '/bad-status',
        handlers: {
            GET: () => {
                throw { status: 999, message: 'boom' };
            },
        },
    },
    {
        path: '/throw-500',
        handlers: {
            GET: () => {
                throw new Error('db: /srv/app/secret');
            },
        },
    },
    {
        path: '/throw-object',
        handlers: {
            GET: () => {
                throw { status: 418, message: 'teapot' };
            },
        },
    },
];

let handler: FetchHandler;

beforeAll(async () => {
    const burger = new Burger({
        apiRoutes: throwingRoutes,
        debug: false,
    });
    handler = await burger.fetchHandler();
});

describe('error rendering', () => {
    it('throw {status: 999} renders 500 instead of escaping as a RangeError', async () => {
        const res = await handler(new Request('http://h/bad-status'));
        expect(res.status).toBe(500);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.status).toBe(500);
    });

    it('WinterCG dispatch: handler throw renders 500, never an unhandled rejection', async () => {
        const res = await handler(new Request('http://h/throw-500'));
        expect(res.status).toBe(500);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.detail).toBe('Internal Server Error');
    });

    it('500 body contains no stack, file paths, or cause chain', async () => {
        const res = await handler(new Request('http://h/throw-500'));
        const text = await res.text();
        expect(text).not.toContain('stack');
        expect(text).not.toContain('packages/');
        expect(text).not.toContain('.ts');
        expect(text).toContain('Internal Server Error');
    });

    it('500 body is fixed even when the throw carries its own message', async () => {
        const res = await handler(new Request('http://h/bad-status'));
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.detail).toBe('Internal Server Error');
        expect(body.message).toBeUndefined();
    });

    it('thrown objects reach onError hooks intact (no String collapse)', async () => {
        let captured: unknown;
        const plan: HookPlan = {
            beforeRoute: [],
            afterRoute: [],
            mapResponse: [],
            onError: [
                (err) => {
                    captured = err;
                },
            ],
        };
        const ctx = BurgerContext.create(new Request('http://h/test'), {
            route: { path: '/test', pattern: '/test' },
        });
        await executeHookPlan(
            ctx,
            plan,
            {
                GET: () => {
                    throw { status: 418, message: 'teapot' };
                },
            },
            new Request('http://h/test')
        );
        expect(captured).toEqual({ status: 418, message: 'teapot' });
        expect((captured as Record<string, unknown>).status).toBe(418);
    });

    it('a thrown object with a valid status renders that status', async () => {
        const res = await handler(new Request('http://h/throw-object'));
        expect(res.status).toBe(418);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.detail).toBe('teapot');
    });
});