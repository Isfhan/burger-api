import { describe, it, expect } from 'bun:test';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';

/**
 * Verifies that `req.route` is available for static routes served through
 * Bun's native routing. Bun invokes the static handler with ONLY `(request)`,
 * so the router must inject `ctxInit` (see `Router.staticRoutes`).
 */
describe('Static route req.route (Bun-native dispatch)', () => {
    it('provides req.route.path / req.route.pattern for a static route', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/users',
                handlers: {
                    GET: (req: any) =>
                        Response.json({
                            path: req.route?.path,
                            pattern: req.route?.pattern,
                        }),
                },
            } as any,
        ];
        const router = new Router({});
        router.compile(defs);

        // Simulate Bun's native static dispatch: handler called with a single
        // argument (no ctxInit).
        const handler = router.staticRoutes()['/users'];
        const res = await handler(new Request('http://h/users'));
        const body = await res.json();

        expect(body.path).toBe('/users');
        expect(body.pattern).toBe('/users');
    });

    it('provides req.route for a trailing-slash-normalized static route', async () => {
        const defs: RouteDefinition[] = [
            {
                path: '/health',
                handlers: {
                    GET: (req: any) => Response.json({ path: req.route?.path }),
                },
            } as any,
        ];
        const router = new Router({});
        router.compile(defs);
        const res = await router.fetch(
            new Request('http://h/health/') // trailing slash → fetch fallback
        );
        expect((await res.json()).path).toBe('/health');
    });
});
