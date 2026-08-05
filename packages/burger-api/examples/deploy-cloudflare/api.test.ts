import { describe, it, expect } from 'bun:test';
import worker from './src/index';

const base = 'https://burger-api-cloudflare.example.com';

describe('deploy-cloudflare example (WinterCG fetch handler)', () => {
    it('GET /api/hello returns JSON', async () => {
        const res = await worker.fetch(new Request(`${base}/api/hello`));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toContain('Cloudflare');
    });

    it('GET /api/users/:id resolves params', async () => {
        const res = await worker.fetch(new Request(`${base}/api/users/42`));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: '42' });
    });

    it('returns 404 for unknown paths', async () => {
        const res = await worker.fetch(new Request(`${base}/api/nope`));
        expect(res.status).toBe(404);
    });
});
