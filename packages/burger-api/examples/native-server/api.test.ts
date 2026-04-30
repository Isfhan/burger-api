/**
 * Minimal Burger app with no apiDir — Swagger UI is always registered.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../test-utils/example-server';

let BASE_URL = 'http://localhost:0';
let testServer: RunningExampleServer | null = null;

beforeAll(async () => {
    testServer = await startExampleServer({
        exampleDir: import.meta.dir,
        healthPath: '/api/ping',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('native-server example', () => {
    it('GET /api/ping returns JSON', async () => {
        const res = await fetch(`${BASE_URL}/api/ping`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.ping).toBe('ok');
    });

    it('serves Swagger UI at /docs', async () => {
        const res = await fetch(`${BASE_URL}/docs`);
        expect(res.ok).toBe(true);
        const text = await res.text();
        expect(text.length).toBeGreaterThan(100);
    });
});
