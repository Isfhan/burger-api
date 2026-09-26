/**
 * Regression tests: the onRequest machinery, lazy `ctx.ip`, and shared app
 * services must exist for apps with pages/assets but no API routes.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';

describe('onRequest machinery without API routes', () => {
    it('runs a plugin onRequest hook once per page and per asset request', async () => {
        const seen: string[] = [];
        const burger = new Burger({
            pageRoutes: [
                { path: '/about', handler: () => new Response('about') },
            ],
            assetRoutes: [
                {
                    path: '/assets/a.txt',
                    contentType: 'text/plain',
                    data: btoa('hi'),
                },
            ],
        }).usePlugin({
            name: 'spy',
            hooks: {
                onRequest: (ctx) => {
                    seen.push(new URL(ctx.url).pathname);
                },
            },
        });

        const handler = await burger.fetchHandler();
        expect(await (await handler(new Request('http://localhost/about'))).text()).toBe(
            'about'
        );
        expect(await (await handler(new Request('http://localhost/assets/a.txt'))).text()).toBe(
            'hi'
        );
        expect(seen).toEqual(['/about', '/assets/a.txt']);
    });

    it('a plugin onRequest Response short-circuits a page request', async () => {
        const burger = new Burger({
            pageRoutes: [
                { path: '/blocked', handler: () => new Response('page') },
            ],
        }).usePlugin({
            name: 'guard',
            hooks: {
                onRequest: () =>
                    new Response('nope', { status: 401 }),
            },
        });

        const handler = await burger.fetchHandler();
        const res = await handler(new Request('http://localhost/blocked'));
        expect(res.status).toBe(401);
        expect(await res.text()).toBe('nope');
    });

    it('ctx.ip and ctx.services are populated on a dynamic page under serve()', async () => {
        const seen: string[] = [];
        const burger = new Burger({
            pageRoutes: [
                {
                    path: '/user/:name',
                    handler: (ctx) =>
                        Response.json({
                            name: ctx.params.name,
                            svc:
                                (
                                    ctx.services as unknown as {
                                        greeting?: string;
                                    }
                                ).greeting ?? null,
                            ip: ctx.ip ?? null,
                        }),
                },
            ],
        })
            .provide('greeting', 'hello')
            .usePlugin({
                name: 'spy',
                hooks: {
                    onRequest: (ctx) => {
                        seen.push(new URL(ctx.url).pathname);
                    },
                },
            });

        const port = 44000 + Math.floor(Math.random() * 1000);
        await burger.serve(port, () => {});
        try {
            const res = await fetch(`http://127.0.0.1:${port}/user/ana`);
            const body = (await res.json()) as {
                name: string;
                svc: string | null;
                ip: string | null;
            };
            expect(body.name).toBe('ana');
            expect(body.svc).toBe('hello');
            expect(body.ip).toContain('127.0.0.1');
            expect(seen).toEqual(['/user/ana']);
        } finally {
            burger.getServer()?.stop();
        }
    });
});
