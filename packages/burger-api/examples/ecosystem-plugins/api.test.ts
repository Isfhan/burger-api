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
        acceptedStatuses: [200, 401],
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('ecosystem-plugins example', () => {
    it('returns plugins list with valid API key', async () => {
        const res = await fetch(`${server!.baseUrl}/api`, {
            headers: { 'X-API-Key': 'demo-api-key-123' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.plugins).toContain('api-key');
    });

    it('rejects missing API key', async () => {
        const res = await fetch(`${server!.baseUrl}/api`);
        expect(res.status).toBe(401);
    });
});
