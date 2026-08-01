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
        healthPath: '/api/health',
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('build-config example', () => {
    it('health check returns ok', async () => {
        const res = await fetch(`${server!.baseUrl}/api/health`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.status).toBe('ok');
        expect(data.timestamp).toBeDefined();
    });
});
