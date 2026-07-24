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

describe('Phase 4 M5-M6 — Plugin & Macro Integration', () => {
    it('plugin beforeHandle runs before the handler', async () => {
        const res = await fetch(`${BASE_URL}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pluginRan).toBe(true);
    });

    it('macro beforeHandle runs before the handler', async () => {
        const res = await fetch(`${BASE_URL}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.macroRan).toBe(true);
    });

    it('plugin provide values are available on the request', async () => {
        const res = await fetch(`${BASE_URL}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pluginValue).toBe('from-plugin');
        expect(data.pluginNumber).toBe(42);
    });

    it('macro provide values are available on the request', async () => {
        const res = await fetch(`${BASE_URL}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.macroValue).toBe('from-macro');
    });

    it('global hooks run alongside plugin and macro hooks', async () => {
        const res = await fetch(`${BASE_URL}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pluginRan).toBe(true);
        expect(data.macroRan).toBe(true);
    });
});
