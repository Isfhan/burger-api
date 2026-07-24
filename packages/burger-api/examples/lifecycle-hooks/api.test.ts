/**
 * Integration tests for Lifecycle Hooks (self-contained routes).
 *
 * Each route directory is self-contained — no group inheritance.
 * Global hooks live at app root (hooks.ts), route hooks in api/[...]/hooks.ts.
 *
 * Exercises:
 *  - beforeRoute ordering and that it runs before the handler
 *  - beforeRoute Response short-circuit (handler skipped)
 *  - afterRoute response transform
 *  - mapResponse final header mutation via ctx.set
 *
 * @file examples/lifecycle-hooks/api.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../test-utils/example-server';

let BASE_URL = '';
let server: RunningExampleServer | null = null;

beforeAll(async () => {
    server = await startExampleServer({
        exampleDir: import.meta.dir,
        healthPath: '/api/echo',
    });
    BASE_URL = server.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('Lifecycle Hooks — Self-Contained Routes', () => {
    it('beforeRoute (global → route) runs before the handler', async () => {
        const res = await fetch(`${BASE_URL}/api/echo`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.hookRan).toBe('before');
        // Global beforeRoute runs first, then route beforeRoute.
        expect(data.order).toEqual(['global', 'route']);
    });

    it('beforeRoute short-circuits with a Response (handler skipped)', async () => {
        const res = await fetch(`${BASE_URL}/api/block`);
        expect(res.status).toBe(403);
        expect(await res.text()).toBe('blocked');
    });

    it('afterRoute transforms the response body', async () => {
        const res = await fetch(`${BASE_URL}/api/after`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ base: 1, after: true });
    });

    it('mapResponse mutates response headers via ctx.set', async () => {
        const res = await fetch(`${BASE_URL}/api/resp`);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-resp')).toBe('1');
    });

    it('onError catches handler throw at route level', async () => {
        const res = await fetch(`${BASE_URL}/api/error`);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data).toEqual({ handled: 'route', message: 'handler-error' });
    });

    it('onError handles error when route defines its own handler', async () => {
        const res = await fetch(`${BASE_URL}/api/error-global`);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data).toEqual({
            handled: 'global',
            message: 'unhandled-by-route',
        });
    });

    it('onError fallthrough within a route (first throws, second catches)', async () => {
        const res = await fetch(`${BASE_URL}/api/error-throw`);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.handled).toBe('route');
    });

    it('transform injects values onto the context before the handler', async () => {
        const res = await fetch(`${BASE_URL}/api/provide-test`, {
            headers: { 'X-Tenant': 'acme' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.user).toEqual({ name: 'alice', role: 'admin' });
    });

    it('transform merges all providers (tenant + user) in a self-contained route', async () => {
        const res = await fetch(`${BASE_URL}/api/provide-test`);
        expect(res.status).toBe(200);
        const data = await res.json();
        // tenant defaults to 'global' when no X-Tenant header
        expect(data.tenant).toBe('global');
        // user from route transform
        expect(data.user).toEqual({ name: 'alice', role: 'admin' });
    });
});
