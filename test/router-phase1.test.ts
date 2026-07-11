import { describe, it, expect } from 'bun:test';
import { Router } from '../packages/burger-api/src/router';
import { AllowCache } from '../packages/burger-api/src/router/allow-cache';
import type {
    RouteDefinition,
    BurgerRequest,
} from '../packages/burger-api/src/types/index';
/**
 * Builds a RouteDefinition from a map of method → handler.
 */
function route(
    path: string,
    handlers: { [method: string]: (req: BurgerRequest) => Response | Promise<Response> },
    extra: Partial<RouteDefinition> = {}
): RouteDefinition {
    return { path, handlers, ...extra };
}

function req(path: string, method = 'GET'): Request {
    return new Request(`http://localhost${path}`, { method });
}

describe('Router — Phase 1 (Hybrid Router)', () => {
    describe('static routes', () => {
        it('serves a static route via the compiled handler', async () => {
            const r = new Router();
            r.compile([route('/health', { GET: () => new Response('ok') })]);
            expect(r.staticRoutes()['/health']).toBeDefined();
            const res = await r.fetch(req('/health'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('ok');
        });

        it('returns 405 with Allow for a known static path + wrong method', async () => {
            const r = new Router();
            r.compile([
                route('/api/posts', {
                    GET: () => new Response('list'),
                    POST: () => new Response('create'),
                }),
            ]);
            const res = await r.fetch(req('/api/posts', 'DELETE'));
            expect(res.status).toBe(405);
            expect(res.headers.get('Allow')).toBe('GET, POST');
        });

        it('does not advertise HEAD in Allow when only GET is defined', async () => {
            const r = new Router();
            r.compile([route('/api/only-get', { GET: () => new Response('x') })]);
            const res = await r.fetch(req('/api/only-get', 'POST'));
            expect(res.status).toBe(405);
            expect(res.headers.get('Allow')).toBe('GET');
        });
    });

    describe('dynamic (:param) routes', () => {
        it('matches a param route and populates req.params', async () => {
            const r = new Router();
            r.compile([
                route('/api/users/:id', {
                    GET: (request) => new Response(request.params!.id),
                }),
            ]);
            const res = await r.fetch(req('/api/users/123'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('123');
        });

        it('returns 405 with Allow for an unsupported method on a param route', async () => {
            const r = new Router();
            r.compile([
                route('/api/users/:id', {
                    GET: () => new Response('u'),
                    PUT: () => new Response('up'),
                }),
            ]);
            const res = await r.fetch(req('/api/users/123', 'DELETE'));
            expect(res.status).toBe(405);
            expect(res.headers.get('Allow')).toBe('GET, PUT');
        });

        it('decodes URL-encoded param segments', async () => {
            const r = new Router();
            r.compile([
                route('/api/users/:name', {
                    GET: (request) => new Response(request.params!.name),
                }),
            ]);
            const res = await r.fetch(req('/api/users/hello%20world'));
            expect(await res.text()).toBe('hello world');
        });
    });

    describe('wildcard (*) routes', () => {
        it('matches a wildcard route and populates req.wildcardParams', async () => {
            const r = new Router();
            r.compile([
                route(
                    '/files/*',
                    {
                        GET: (request) =>
                            new Response((request.wildcardParams ?? []).join(',')),
                    },
                    { isWildcard: true }
                ),
            ]);
            const res = await r.fetch(req('/files/a/b/c'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('a,b,c');
        });

        it('matches the wildcard base path (e.g. /files matches /files/*)', async () => {
            const r = new Router();
            r.compile([
                route(
                    '/files/*',
                    {
                        GET: (request) =>
                            new Response(
                                'wp=' + (request.wildcardParams ?? []).join(',')
                            ),
                    },
                    { isWildcard: true }
                ),
            ]);
            const res = await r.fetch(req('/files'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('wp=');
        });

        it('matches a wildcard nested under a param route', async () => {
            const r = new Router();
            r.compile([
                route(
                    '/api/users/:userId/*',
                    {
                        GET: (request) =>
                            new Response(
                                `id=${request.params!.userId};wp=${
                                    (request.wildcardParams ?? []).join(',')
                                }`
                            ),
                    },
                    { isWildcard: true }
                ),
            ]);
            const res = await r.fetch(req('/api/users/3/posts'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('id=3;wp=posts');
        });
    });

    describe('precedence (static > param > wildcard)', () => {
        it('prefers a static route over a param route at the same level', async () => {
            const r = new Router();
            r.compile([
                route('/api/x', { GET: () => new Response('static') }),
                route('/api/:id', {
                    GET: (request) => new Response('param:' + request.params!.id),
                }),
                route('/api/*', { GET: () => new Response('wild') }, { isWildcard: true }),
            ]);
            const res = await r.fetch(req('/api/x'));
            expect(await res.text()).toBe('static');
        });

        it('prefers a param route over a wildcard route', async () => {
            const r = new Router();
            r.compile([
                route('/api/:id', {
                    GET: (request) => new Response('param:' + request.params!.id),
                }),
                route('/api/*', { GET: () => new Response('wild') }, { isWildcard: true }),
            ]);
            const res = await r.fetch(req('/api/foo/bar'));
            expect(await res.text()).toBe('wild'); // foo matched by param, bar by wildcard
        });

        it('falls through a static prefix that cannot complete to the wildcard sibling', async () => {
            const r = new Router();
            r.compile([
                // static deeper route that requires an extra segment
                route('/api/users/:userId/posts/:postId', {
                    GET: () => new Response('deep'),
                }),
                // wildcard that catches /api/users/:userId/<anything>
                route('/api/users/:userId/*', { GET: () => new Response('wild') }, { isWildcard: true }),
            ]);
            const res = await r.fetch(req('/api/users/3/posts'));
            expect(await res.text()).toBe('wild');
            const deep = await r.fetch(req('/api/users/3/posts/9'));
            expect(await deep.text()).toBe('deep');
        });
    });

    describe('auto-HEAD', () => {
        it('derives HEAD from GET (empty body, GET headers)', async () => {
            const r = new Router();
            r.compile([
                route('/api/head', {
                    GET: () =>
                        new Response('body', { headers: { 'X-Marker': '1' } }),
                }),
            ]);
            const res = await r.fetch(req('/api/head', 'HEAD'));
            expect(res.status).toBe(200);
            expect(res.headers.get('X-Marker')).toBe('1');
            expect(await res.text()).toBe('');
        });

        it('returns 405 for HEAD when the route has no GET', async () => {
            const r = new Router();
            r.compile([route('/api/post-only', { POST: () => new Response('x') })]);
            const res = await r.fetch(req('/api/post-only', 'HEAD'));
            expect(res.status).toBe(405);
            expect(res.headers.get('Allow')).toBe('POST');
        });
    });

    describe('loose trailing slash', () => {
        it('treats /foo/ as equivalent to /foo for a static-only route', async () => {
            const r = new Router();
            r.compile([route('/foo', { GET: () => new Response('foo') })]);
            const res = await r.fetch(req('/foo/'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('foo');
        });

        it('collapses repeated slashes', async () => {
            const r = new Router();
            r.compile([route('/bar', { GET: () => new Response('bar') })]);
            const res = await r.fetch(req('/bar//'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('bar');
        });

        it('routes a trailing-slash dynamic path to the param route (empty value)', async () => {
            const r = new Router();
            r.compile([
                route('/api/users', { GET: () => new Response('list') }),
                route('/api/users/:userId', {
                    GET: (request) =>
                        new Response('id=' + (request.params!.userId ?? 'EMPTY')),
                }),
            ]);
            const res = await r.fetch(req('/api/users/'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('id=');
        });
    });

    describe('unknown routes', () => {
        it('returns 404 for an unmatched path', async () => {
            const r = new Router();
            r.compile([route('/known', { GET: () => new Response('x') })]);
            const res = await r.fetch(req('/unknown'));
            expect(res.status).toBe(404);
        });
    });

    describe('middleware delegation', () => {
        it('runs global + route middleware in order before the handler', async () => {
            const r = new Router({
                globalMiddleware: [
                    async (request) => {
                        (request as any).order = 'g';
                    },
                ],
            });
            r.compile([
                route(
                    '/mw',
                    {
                        GET: (request) =>
                            new Response((request as any).order || 'none'),
                    },
                    {
                        middleware: [
                            async (request) => {
                                (request as any).order += '>r';
                            },
                        ],
                    }
                ),
            ]);
            const res = await r.fetch(req('/mw'));
            expect(await res.text()).toBe('g>r');
        });

        it('supports multiple route middlewares (3+ fast path)', async () => {
            const r = new Router();
            const seen: string[] = [];
            r.compile([
                route(
                    '/chain',
                    {
                        GET: () => new Response(seen.join(',')),
                    },
                    {
                        middleware: [
                            async () => {
                                seen.push('a');
                            },
                            async () => {
                                seen.push('b');
                            },
                            async () => {
                                seen.push('c');
                            },
                        ],
                    }
                ),
            ]);
            const res = await r.fetch(req('/chain'));
            expect(await res.text()).toBe('a,b,c');
        });
    });

    describe('compile-time safety', () => {
        it('throws on a duplicate static route', () => {
            expect(() =>
                new Router().compile([
                    route('/dup', { GET: () => new Response('a') }),
                    route('/dup', { GET: () => new Response('b') }),
                ])
            ).toThrow(/Duplicate static route/i);
        });

        it('throws on ambiguous param folders at the same level', () => {
            expect(() =>
                new Router().compile([
                    route('/a/:id', { GET: () => new Response('x') }),
                    route('/a/:slug', { GET: () => new Response('y') }),
                ])
            ).toThrow(/Ambiguous dynamic/i);
        });
    });

    describe('AllowCache', () => {
        it('joins methods into an Allow header value', () => {
            expect(new AllowCache().compute(['GET', 'POST'])).toBe('GET, POST');
        });
    });
});
