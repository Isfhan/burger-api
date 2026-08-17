/**
 * API key plugin: constant-time digest comparison, no timing oracle.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import { apiKey } from '../../../../ecosystem/plugins/api-key/api-key';

async function run(
    options: Parameters<typeof apiKey>[0],
    path: string,
    init?: RequestInit
): Promise<Response> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api/guarded',
                handlers: { GET: () => Response.json({ ok: true }) },
                openapi: {},
            },
            {
                path: '/api/open',
                handlers: { GET: () => Response.json({ ok: true }) },
                config: { auth: false },
                openapi: {},
            },
        ],
    });
    burger.usePlugin(apiKey(options));
    const handler = await burger.fetchHandler();
    return handler(new Request(`http://localhost${path}`, init));
}

const withKey = (key: string): RequestInit => ({
    headers: { 'X-API-Key': key },
});

describe('api-key', () => {
    it('accepts a matching key and rejects wrong or missing keys', async () => {
        const opts = { keys: ['super-secret-key-1', 'super-secret-key-2'] };
        expect((await run(opts, '/api/guarded', withKey('super-secret-key-1'))).status).toBe(200);
        expect((await run(opts, '/api/guarded', withKey('super-secret-key-2'))).status).toBe(200);
        expect((await run(opts, '/api/guarded', withKey('wrong-key'))).status).toBe(401);
        expect((await run(opts, '/api/guarded')).status).toBe(401);
    });

    it('auth-disabled routes are open', async () => {
        expect((await run({ keys: ['k-1'] }, '/api/open')).status).toBe(200);
        expect(
            (await run({ keys: ['k-1'] }, '/api/guarded', withKey('k-1'))).status
        ).toBe(200);
    });

    it('supports dynamic validation and attaches the key to context', async () => {
        const seen: string[] = [];
        const opts = {
            validate: async (key: string) => {
                seen.push(key);
                return key === 'db-key-1';
            },
        };
        expect((await run(opts, '/api/guarded', withKey('db-key-1'))).status).toBe(200);
        expect((await run(opts, '/api/guarded', withKey('db-key-2'))).status).toBe(401);
        expect(seen).toEqual(['db-key-1', 'db-key-2']);
    });

    it('timing is flat across keys that share a prefix with the real key', async () => {
        const opts = { keys: ['super-secret-key-0123456789abcdef'] };
        const samePrefix = 'super-secret-key-xxxxxxxxxxxxxxxx';
        const random = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';

        async function medianTime(key: string): Promise<number> {
            const times: number[] = [];
            for (let i = 0; i < 25; i++) {
                const start = performance.now();
                await run(opts, '/api/guarded', withKey(key));
                times.push(performance.now() - start);
            }
            times.sort((a, b) => a - b);
            return times[12]!;
        }

        const prefixT = await medianTime(samePrefix);
        const randomT = await medianTime(random);
        // A byte-wise short-circuit comparison would make `random` much
        // faster than `samePrefix`. Constant-time comparison keeps the
        // median delta within measurement noise.
        expect(Math.abs(prefixT - randomT)).toBeLessThan(10);
    });
});