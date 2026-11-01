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
        healthPath: '/api/products',
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('routing example', () => {
    it('GET /api/products returns list', async () => {
        const res = await fetch(`${server!.baseUrl}/api/products`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.message).toBe('Products list');
    });

    it('GET /api/products/1 returns product by id', async () => {
        const res = await fetch(`${server!.baseUrl}/api/products/1`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.id).toBe('1');
    });

    it('group folder does not appear in URL', async () => {
        const res = await fetch(`${server!.baseUrl}/api/products`);
        expect(res.ok).toBe(true);
        // (group) is URL-excluded
        const resGroup = await fetch(`${server!.baseUrl}/api/(group)/products`);
        expect(resGroup.status).toBe(404);
    });

    it('GET /api/profile/123 works with dynamic param', async () => {
        const res = await fetch(`${server!.baseUrl}/api/profile/123`);
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.id).toBe('123');
    });

    it('returns 404 for unknown routes', async () => {
        const res = await fetch(`${server!.baseUrl}/api/unknown`);
        expect(res.status).toBe(404);
    });
});
