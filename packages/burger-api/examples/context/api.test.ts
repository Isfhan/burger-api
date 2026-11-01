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
        healthPath: '/api/cookies',
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('context example', () => {
    it('reads cookies from request', async () => {
        const res = await fetch(`${server!.baseUrl}/api/cookies`, {
            headers: { Cookie: 'session_id=abc123; theme=dark' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.cookies.session_id).toBe('abc123');
        expect(data.cookies.theme).toBe('dark');
        expect(data.hasSession).toBe(true);
    });

    it('reads headers from request', async () => {
        const res = await fetch(`${server!.baseUrl}/api/headers`, {
            headers: { 'X-Custom': 'test-value' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toBe('Request headers');
        expect(data.userAgent).toBeDefined();
    });

    it('sets custom response headers via ctx.set', async () => {
        const res = await fetch(`${server!.baseUrl}/api/set`);
        expect(res.status).toBe(200);
        expect(res.headers.get('X-Custom-Header')).toBe('hello');
        expect(res.headers.get('X-Request-Time')).toBeDefined();
    });

    it('accesses route config from config.ts', async () => {
        const res = await fetch(`${server!.baseUrl}/api/config`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.cacheEnabled).toBe(true);
        expect(data.cacheMaxAge).toBe(300);
    });

    it('parses JSON body via ctx.json()', async () => {
        const res = await fetch(`${server!.baseUrl}/api/body`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'test', value: 42 }),
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.body.name).toBe('test');
        expect(data.body.value).toBe(42);
        expect(data.method).toBe('POST');
    });
});
