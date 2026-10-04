import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';

describe('static pages get a real BurgerContext', () => {
    it('exposes services, query and set', async () => {
        const burger = new Burger({
            pageRoutes: [
                {
                    path: '/about',
                    handler: (ctx: any) =>
                        Response.json({
                            greeting: ctx.services.greeting,
                            q: ctx.query.q ?? null,
                            hasSet: ctx.hasSet(),
                        }),
                },
            ],
        }).provide('greeting', 'hello');

        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/about?q=hi')
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            greeting: string;
            q: string | null;
            hasSet: boolean;
        };
        expect(body.greeting).toBe('hello');
        expect(body.q).toBe('hi');
        expect(body.hasSet).toBe(false);
    });

    it('applies ctx.set from a static page', async () => {
        const burger = new Burger({
            pageRoutes: [
                {
                    path: '/tagged',
                    handler: (ctx: any) => {
                        ctx.set.headers['x-page'] = 'yes';
                        return new Response('ok');
                    },
                },
            ],
        });
        const handler = await burger.fetchHandler();
        const res = await handler(new Request('http://localhost/tagged'));
        expect(res.headers.get('x-page')).toBe('yes');
    });

    it('still exposes the Request surface', async () => {
        const burger = new Burger({
            pageRoutes: [
                {
                    path: '/req',
                    handler: (ctx: any) =>
                        Response.json({
                            url: ctx.url,
                            method: ctx.method,
                            header: ctx.headers.get('x-test'),
                        }),
                },
            ],
        });
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/req', {
                headers: { 'x-test': 'v' },
            })
        );
        const body = (await res.json()) as {
            url: string;
            method: string;
            header: string;
        };
        expect(body.url).toBe('http://localhost/req');
        expect(body.method).toBe('GET');
        expect(body.header).toBe('v');
    });
});

describe('pages/assets/docs answer GET and HEAD only', () => {
    it('405 for a page POST with Allow: GET, HEAD', async () => {
        const burger = new Burger({
            pageRoutes: [
                { path: '/about', handler: () => new Response('about') },
            ],
        });
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/about', { method: 'POST' })
        );
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET, HEAD');
        expect(res.headers.get('content-type')).toBe(
            'application/problem+json'
        );
        const body = (await res.json()) as { title: string };
        expect(body.title).toBe('Method Not Allowed');
    });

    it('405 for an asset POST', async () => {
        const burger = new Burger({
            assetRoutes: [
                { path: '/assets/a.txt', contentType: 'text/plain', data: '' },
            ],
        });
        const handler = await burger.fetchHandler();
        const res = await handler(
            new Request('http://localhost/assets/a.txt', { method: 'PUT' })
        );
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET, HEAD');
    });

    it('405 for a docs POST and an openapi.json POST', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/ok',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
        });
        const handler = await burger.fetchHandler();
        for (const path of ['/docs', '/openapi.json']) {
            const res = await handler(
                new Request(`http://localhost${path}`, { method: 'POST' })
            );
            expect(res.status).toBe(405);
            expect(res.headers.get('allow')).toBe('GET, HEAD');
        }
    });

    it('answers GET and HEAD', async () => {
        const burger = new Burger({
            pageRoutes: [
                { path: '/about', handler: () => new Response('about') },
            ],
        });
        const handler = await burger.fetchHandler();
        const get = await handler(new Request('http://localhost/about'));
        expect(get.status).toBe(200);
        const head = await handler(
            new Request('http://localhost/about', { method: 'HEAD' })
        );
        expect(head.status).toBe(200);
    });
});
