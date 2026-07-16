/**
 * Integration test for the Phase 2 request context (`req.query`, `req.route`,
 * `req.set`). Starts the example server and asserts the new fields behave
 * correctly end-to-end. Also serves as documentation of the public API.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../test-utils/example-server';

let BASE_URL = 'http://localhost:0';
let testServer: RunningExampleServer | null = null;

async function fetchJSON<T = any>(path: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
}

beforeAll(async () => {
    testServer = await startExampleServer({
        exampleDir: import.meta.dir,
        healthPath: '/api/demo',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('Phase 2 request context example', () => {
    describe('req.query + req.route', () => {
        it('exposes the lazily parsed query and matched-route identity', async () => {
            const data = await fetchJSON('/api/demo?q=hello&page=2');
            expect(data.route).toEqual({
                path: '/api/demo',
                pattern: '/api/demo',
            });
            expect(data.query).toEqual({ q: 'hello', page: '2' });
        });
    });

    describe('req.set', () => {
        it('applies status + headers via the response-mutation surface', async () => {
            const res = await fetch(`${BASE_URL}/api/demo/set`);
            expect(res.status).toBe(202);
            expect(res.headers.get('x-context-demo')).toBe('set-works');
            expect(await res.json()).toEqual({ ok: true });
        });
    });

    describe('req.params + req.route (dynamic)', () => {
        it('exposes path params and the route pattern', async () => {
            const data = await fetchJSON('/api/demo/params/42');
            expect(data.id).toBe('42');
            expect(data.route).toEqual({
                path: '/api/demo/params/42',
                pattern: '/api/demo/params/:id',
            });
        });
    });
});
