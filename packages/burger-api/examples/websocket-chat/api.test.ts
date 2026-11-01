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

describe('websocket-chat example', () => {
    it('server starts and accepts connections', async () => {
        const res = await fetch(`${server!.baseUrl}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });
});
