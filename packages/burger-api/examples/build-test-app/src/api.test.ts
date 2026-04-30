/**
 * Build fixture app — full route demo under src/.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../../test-utils/example-server';

let BASE_URL = 'http://localhost:0';
let testServer: RunningExampleServer | null = null;

beforeAll(async () => {
    testServer = await startExampleServer({
        exampleDir: import.meta.dir,
        healthPath: '/api',
    });
    BASE_URL = testServer.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(testServer);
});

describe('build-test-app (src)', () => {
    it('GET /api returns paginated data', async () => {
        const res = await fetch(`${BASE_URL}/api`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data).toBeArray();
    });
});
