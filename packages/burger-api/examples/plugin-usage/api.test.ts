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
        healthPath: '/api',
    });
    BASE_URL = server.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('Plugin Usage Example', () => {
    it('returns a greeting with auditTimestamp from plugin transform', async () => {
        const res = await fetch(`${BASE_URL}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toBe('Hello from plugin-usage example!');
        expect(typeof data.auditTimestamp).toBe('number');
    });
});
