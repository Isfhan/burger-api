import { describe, it, expect } from 'bun:test';
import app from './src/index';

const base = 'https://burger-api-deno.example.com';

describe('deploy-deno example (WinterCG fetch handler)', () => {
    it('GET /api/hello returns JSON', async () => {
        const res = await app.fetch(new Request(`${base}/api/hello`));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toContain('Deno');
    });

    it('GET /api/users/:id resolves params', async () => {
        const res = await app.fetch(new Request(`${base}/api/users/99`));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: '99' });
    });

    it('returns 404 for unknown paths', async () => {
        const res = await app.fetch(new Request(`${base}/api/nope`));
        expect(res.status).toBe(404);
    });
});
