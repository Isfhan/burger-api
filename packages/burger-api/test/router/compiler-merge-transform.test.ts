import { describe, it, expect } from 'bun:test';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';
import type { ResolvedPlugin } from '../../src/plugin/types';

describe('RouterCompiler mergeTransformRecords', () => {
    function makeRouter(
        defs: RouteDefinition[],
        plugins?: ResolvedPlugin[]
    ): Router {
        const router = new Router({});
        router.compile(defs, plugins);
        return router;
    }

    it('provides plugin values when no route transform exists', async () => {
        const router = makeRouter(
            [
                {
                    path: '/test',
                    handlers: {
                        GET: (req: any) =>
                            Response.json({
                                pv: req.pluginValue,
                                pn: req.pluginNumber,
                            }),
                    },
                } as any,
            ],
            [
                {
                    name: 'test-plugin',
                    scope: 'plugin' as const,
                    hooks: {
                        transform: {
                            pluginValue: () => 'from-plugin',
                            pluginNumber: () => 42,
                        },
                    },
                },
            ]
        );
        const res = await router.fetch(new Request('http://h/test'));
        const data = await res.json();
        expect(data.pv).toBe('from-plugin');
        expect(data.pn).toBe(42);
    });

    it('route transform overrides plugin transform on key collision', async () => {
        const router = makeRouter(
            [
                {
                    path: '/override',
                    handlers: {
                        GET: (req: any) =>
                            Response.json({ val: req.sharedKey }),
                    },
                    hooks: {
                        transform: {
                            sharedKey: () => 'from-route',
                        },
                    },
                } as any,
            ],
            [
                {
                    name: 'plugin-a',
                    scope: 'plugin' as const,
                    hooks: {
                        transform: {
                            sharedKey: () => 'from-plugin',
                        },
                    },
                },
            ]
        );
        const res = await router.fetch(new Request('http://h/override'));
        const data = await res.json();
        expect(data.val).toBe('from-route');
    });

    it('merges transform from multiple plugins', async () => {
        const router = makeRouter(
            [
                {
                    path: '/multi',
                    handlers: {
                        GET: (req: any) =>
                            Response.json({
                                a: req.valA,
                                b: req.valB,
                            }),
                    },
                } as any,
            ],
            [
                {
                    name: 'plugin-a',
                    scope: 'plugin' as const,
                    hooks: {
                        transform: {
                            valA: () => 'alpha',
                        },
                    },
                },
                {
                    name: 'plugin-b',
                    scope: 'plugin' as const,
                    hooks: {
                        transform: {
                            valB: () => 'beta',
                        },
                    },
                },
            ]
        );
        const res = await router.fetch(new Request('http://h/multi'));
        const data = await res.json();
        expect(data.a).toBe('alpha');
        expect(data.b).toBe('beta');
    });

    it('transform is undefined when no transform values exist', async () => {
        const router = makeRouter(
            [
                {
                    path: '/noprov',
                    handlers: {
                        GET: () => Response.json({ ok: true }),
                    },
                } as any,
            ],
            []
        );
        const res = await router.fetch(new Request('http://h/noprov'));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });

    it('transform factories receive the request context', async () => {
        const router = makeRouter(
            [
                {
                    path: '/ctx',
                    handlers: {
                        GET: (req: any) =>
                            Response.json({ val: req.contextVal }),
                    },
                } as any,
            ],
            [
                {
                    name: 'ctx-plugin',
                    scope: 'plugin' as const,
                    hooks: {
                        transform: {
                            contextVal: (ctx: any) =>
                                `method-${ctx.method}`,
                        },
                    },
                },
            ]
        );
        const res = await router.fetch(new Request('http://h/ctx'));
        const data = await res.json();
        expect(data.val).toBe('method-GET');
    });
});
