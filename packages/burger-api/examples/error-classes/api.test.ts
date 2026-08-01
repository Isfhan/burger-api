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
        healthPath: '/api/users',
    });
});

afterAll(async () => {
    await stopExampleServer(server);
});

describe('error-classes example', () => {
    it('lists users', async () => {
        const res = await fetch(`${server!.baseUrl}/api/users`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.users).toHaveLength(2);
    });

    it('returns user by id', async () => {
        const res = await fetch(`${server!.baseUrl}/api/users/1`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.user.name).toBe('Alice');
    });

    it('returns NotFoundError for missing user', async () => {
        const res = await fetch(`${server!.baseUrl}/api/users/999`);
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.title).toBe('NotFoundError');
        expect(data.status).toBe(404);
    });

    it('returns UnauthorizedError when no auth header', async () => {
        const res = await fetch(`${server!.baseUrl}/api/admin`);
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.title).toBe('UnauthorizedError');
        expect(data.status).toBe(401);
    });

    it('returns ForbiddenError when wrong token', async () => {
        const res = await fetch(`${server!.baseUrl}/api/admin`, {
            headers: { Authorization: 'Bearer wrong-token' },
        });
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.title).toBe('ForbiddenError');
        expect(data.status).toBe(403);
    });

    it('returns 200 with valid admin token', async () => {
        const res = await fetch(`${server!.baseUrl}/api/admin`, {
            headers: { Authorization: 'Bearer admin-token' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toBe('Welcome, admin!');
    });
});
