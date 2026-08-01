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
        healthPath: '/api/public',
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('macros example', () => {
    it('public endpoint returns 200', async () => {
        const res = await fetch(`${server!.baseUrl}/api/public`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toBe('Public endpoint with rate limiting');
    });

    it('admin endpoint returns 200 with user context', async () => {
        const res = await fetch(`${server!.baseUrl}/api/admin`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toBe('Admin panel');
    });
});
