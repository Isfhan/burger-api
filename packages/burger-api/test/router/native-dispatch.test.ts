/**
 * Per-method native dispatch (Bun `routes` method objects): 405 + Allow,
 * auto-HEAD/OPTIONS, decoded params, handler-return/error handling, lazy
 * `ctx.ip`, and exactly-once `onRequest`. These exercise the real Bun
 * `serve()` path; `router.fetch` covers the fallback.
 */
import { describe, it, expect, beforeAll, afterAll, spyOn } from 'bun:test';
import { Burger } from '../../src/index';
import type { BurgerContext } from '../../src/context/context';

const PORT = 43200 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;

let burger: Burger;
let onRequestCount = 0;
let quietError: { mockRestore(): void };

beforeAll(async () => {
    quietError = spyOn(console, 'error').mockImplementation(() => {});
    burger = new Burger({
        debug: true,
        apiRoutes: [
            {
                path: '/static',
                handlers: { GET: () => new Response('hello') },
            },
            {
                path: '/param/:id',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({ id: ctx.params.id }),
                },
            },
            {
                path: '/plain',
                handlers: { GET: (() => ({ nope: true })) as never },
            },
            {
                path: '/boom',
                handlers: {
                    GET: () => {
                        throw new Error('kaboom');
                    },
                },
                hooks: {
                    onError: () => new Response('handled', { status: 599 }),
                },
            },
            {
                path: '/ip',
                handlers: {
                    GET: (ctx: BurgerContext) =>
                        Response.json({ ip: ctx.ip ?? null }),
                },
            },
        ],
        globalHooks: {
            onRequest: () => {
                onRequestCount++;
            },
        },
    });
    await burger.serve(PORT, () => {});
});

afterAll(() => {
    burger.getServer()?.stop();
    quietError.mockRestore();
});

describe('native method dispatch', () => {
    it('405 + Allow for an undefined method on a static route', async () => {
        const res = await fetch(`${BASE}/static`, { method: 'POST' });
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET');
        expect(res.headers.get('content-type')).toBe(
            'application/problem+json'
        );
        expect(await res.json()).toEqual({
            type: 'about:blank',
            title: 'Method Not Allowed',
            status: 405,
            detail: 'Supported methods: GET',
        });
    });

    it('405 + Allow for an undefined method on a dynamic route', async () => {
        const res = await fetch(`${BASE}/param/7`, { method: 'DELETE' });
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET');
    });

    it('auto-HEAD reports the GET Content-Length with an empty body', async () => {
        const res = await fetch(`${BASE}/static`, { method: 'HEAD' });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-length')).toBe('5');
        expect(await res.text()).toBe('');
    });

    it('auto-HEAD on a dynamic route reports the JSON size', async () => {
        const json = JSON.stringify({ id: '7' });
        const res = await fetch(`${BASE}/param/7`, { method: 'HEAD' });
        expect(res.headers.get('content-length')).toBe(String(json.length));
        expect(await res.text()).toBe('');
    });

    it('auto-OPTIONS answers 204 + Allow (static and dynamic)', async () => {
        for (const path of ['/static', '/param/1']) {
            const res = await fetch(`${BASE}${path}`, { method: 'OPTIONS' });
            expect(res.status).toBe(204);
            expect(res.headers.get('allow')).toBe('GET, OPTIONS');
        }
    });

    it('decodes percent-encoded native params', async () => {
        const res = await fetch(`${BASE}/param/a%20b`);
        expect(await res.json()).toEqual({ id: 'a b' });
    });

    it('decodes percent-encoded params through the fallback path too', async () => {
        const res = await fetch(`${BASE}/param/a%20b/`);
        expect(await res.json()).toEqual({ id: 'a b' });
    });

    it('non-Response handler return → 500 with the fail-loud detail', async () => {
        const res = await fetch(`${BASE}/plain`);
        expect(res.status).toBe(500);
        const body = (await res.json()) as { detail: string };
        expect(body.detail).toBe(
            'GET /plain returned object; route handlers must return a Response'
        );
    });

    it('a thrown error dispatches through onError', async () => {
        const res = await fetch(`${BASE}/boom`);
        expect(res.status).toBe(599);
        expect(await res.text()).toBe('handled');
    });

    it('ctx.ip is defined on Bun serve()', async () => {
        const res = await fetch(`${BASE}/ip`);
        const body = (await res.json()) as { ip: string | null };
        expect(body.ip).toContain('127.0.0.1');
    });

    it('onRequest runs exactly once for a 405', async () => {
        const before = onRequestCount;
        const res = await fetch(`${BASE}/static`, { method: 'PATCH' });
        expect(res.status).toBe(405);
        expect(onRequestCount - before).toBe(1);
    });
});
