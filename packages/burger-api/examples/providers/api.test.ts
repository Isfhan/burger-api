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

describe('providers example', () => {
    it('returns users from the db service', async () => {
        const res = await fetch(`${server!.baseUrl}/api/users`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.users).toHaveLength(2);
        expect(data.users[0].name).toBe('Alice');
    });

    it('returns a single user by id', async () => {
        const res = await fetch(`${server!.baseUrl}/api/users/1`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.user.name).toBe('Alice');
    });

    it('returns 404 for unknown user', async () => {
        const res = await fetch(`${server!.baseUrl}/api/users/999`);
        expect(res.status).toBe(404);
    });
});
