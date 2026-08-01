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
        healthPath: '/api',
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('ecosystem-hooks example', () => {
    it('returns all hooks list', async () => {
        const res = await fetch(`${server!.baseUrl}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.hooks).toContain('cors');
        expect(data.hooks).toContain('logger');
        expect(data.hooks).toContain('compression');
    });

    it('sets security headers', async () => {
        const res = await fetch(`${server!.baseUrl}/api`);
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(res.headers.get('x-frame-options')).toBe('DENY');
    });

    it('sets cache control header', async () => {
        const res = await fetch(`${server!.baseUrl}/api`);
        const cacheControl = res.headers.get('cache-control');
        expect(cacheControl).toContain('no-cache');
    });

    it('sets CORS headers on GET', async () => {
        const res = await fetch(`${server!.baseUrl}/api`, {
            headers: { Origin: 'http://localhost:3000' },
        });
        expect(res.headers.get('access-control-allow-origin')).toBeDefined();
    });
});
