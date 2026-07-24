import { describe, it, expect } from 'bun:test';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';

function makeRouter(defs: RouteDefinition[]): Router {
    const router = new Router({});
    router.compile(defs);
    return router;
}

function makeHooks(n: number): any[] {
    const hooks: any[] = [];
    for (let i = 0; i < n; i++) {
        const idx = i;
        hooks.push((req: any) => {
            req._bench = req._bench || [];
            req._bench.push(idx);
        });
    }
    return hooks;
}

async function fireN(
    router: Router,
    path: string,
    n: number
): Promise<number> {
    const start = performance.now();
    const requests = Array.from({ length: n }, (_, i) =>
        router.fetch(new Request(`http://h${path}?n=${i}`))
    );
    const results = await Promise.all(requests);
    const elapsed = performance.now() - start;
    for (const r of results) {
        expect(r.status).toBe(200);
    }
    return elapsed;
}

describe('Lifecycle performance regression checks', () => {
    const N = 100;

    it(`handles ${N} requests with no hooks`, async () => {
        const router = makeRouter([
            {
                path: '/bare',
                handlers: { GET: () => Response.json({ ok: true }) },
            } as any,
        ]);
        const elapsed = await fireN(router, '/bare', N);
        expect(elapsed).toBeLessThan(5000);
    });

    it(`handles ${N} requests with 1 beforeHandle hook`, async () => {
        const router = makeRouter([
            {
                path: '/h1',
                handlers: {
                    GET: (req: any) => Response.json({ h: req._bench }),
                },
                hooks: { beforeHandle: makeHooks(1) },
            } as any,
        ]);
        const elapsed = await fireN(router, '/h1', N);
        expect(elapsed).toBeLessThan(5000);
    });

    it(`handles ${N} requests with 5 beforeHandle hooks`, async () => {
        const router = makeRouter([
            {
                path: '/h5',
                handlers: {
                    GET: (req: any) => Response.json({ h: req._bench }),
                },
                hooks: { beforeHandle: makeHooks(5) },
            } as any,
        ]);
        const elapsed = await fireN(router, '/h5', N);
        expect(elapsed).toBeLessThan(5000);
    });

    it(`handles ${N} requests with provide values`, async () => {
        const router = makeRouter([
            {
                path: '/prov',
                handlers: {
                    GET: (req: any) =>
                        Response.json({ v: req.pluginValue }),
                },
                hooks: {
                    provide: {
                        pluginValue: () => 'test',
                    },
                },
            } as any,
        ]);
        const elapsed = await fireN(router, '/prov', N);
        expect(elapsed).toBeLessThan(5000);
    });
});
