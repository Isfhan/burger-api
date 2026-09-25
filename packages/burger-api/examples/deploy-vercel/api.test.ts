import { describe, it, expect } from 'bun:test';
import fn from './api/index';

const base = 'https://burger-api-vercel.example.com';

describe('deploy-vercel example (WinterCG fetch handler)', () => {
    it('GET /api/hello returns JSON', async () => {
        const res = await fn.fetch(new Request(`${base}/api/hello`));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toContain('Vercel');
    });

    it('GET /api/users/:id resolves params', async () => {
        const res = await fn.fetch(new Request(`${base}/api/users/7`));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: '7' });
    });

    it('returns 404 for unknown paths', async () => {
        const res = await fn.fetch(new Request(`${base}/api/nope`));
        expect(res.status).toBe(404);
    });
});
