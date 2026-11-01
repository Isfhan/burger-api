import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../test-utils/example-server';

let server: RunningExampleServer | null = null;

beforeAll(async () => {
    server = await startExampleServer({
        exampleDir: import.meta.dir,
        healthPath: '/api/ping',
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('basic example', () => {
    it('GET /api/ping returns JSON', async () => {
        const res = await fetch(`${server!.baseUrl}/api/ping`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.ping).toBe('ok');
    });

    it('serves Swagger UI at /docs', async () => {
        const res = await fetch(`${server!.baseUrl}/docs`);
        expect(res.ok).toBe(true);
        const text = await res.text();
        expect(text.length).toBeGreaterThan(100);
    });
});
