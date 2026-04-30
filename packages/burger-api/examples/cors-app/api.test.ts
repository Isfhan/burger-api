/**
 * CORS example — verifies server starts and CORS headers on API + OPTIONS.
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
        healthPath: '/api/test',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('cors-app example', () => {
    it('GET /api/test returns JSON', async () => {
        const res = await fetch(`${BASE_URL}/api/test`, {
            headers: { Origin: 'http://localhost:3000' },
        });
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.message).toContain('Hello World');
    });

    it('sets CORS headers for allowed origin', async () => {
        const res = await fetch(`${BASE_URL}/api/test`, {
            headers: { Origin: 'http://localhost:3000' },
        });
        const allow = res.headers.get('Access-Control-Allow-Origin');
        expect(allow).toBeTruthy();
    });

    it('handles OPTIONS preflight', async () => {
        const res = await fetch(`${BASE_URL}/api/test`, {
            method: 'OPTIONS',
            headers: {
                Origin: 'http://localhost:3000',
                'Access-Control-Request-Method': 'POST',
            },
        });
        expect([200, 204]).toContain(res.status);
    });
});
