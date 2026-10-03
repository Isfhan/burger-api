import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../examples/test-utils/example-server';

let BASE_URL = '';
let server: RunningExampleServer | null = null;

beforeAll(async () => {
    server = await startExampleServer({
        exampleDir: import.meta.dir + '/plugin-harness',
        healthPath: '/api',
    });
    BASE_URL = server.baseUrl;
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('M5 — Plugin Integration', () => {
    it('plugin beforeRoute runs before the handler', async () => {
        const res = await fetch(`${BASE_URL}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pluginRan).toBe(true);
    });

    it('plugin transform values are available on the request', async () => {
        const res = await fetch(`${BASE_URL}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pluginValue).toBe('from-plugin');
        expect(data.pluginNumber).toBe(42);
    });
});
