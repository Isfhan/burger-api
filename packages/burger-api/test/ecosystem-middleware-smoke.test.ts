/**
 * Spawns test/ecosystem-harness per middleware and asserts minimal HTTP behavior.
 */
import { describe, it, expect } from 'bun:test';
import { join } from 'path';
import {
    startExampleServer,
    stopExampleServer,
    type RunningExampleServer,
} from '../examples/test-utils/example-server';

const harnessDir = join(import.meta.dir, 'ecosystem-harness');

async function withHarness(
    mw: string,
    fn: (baseUrl: string) => Promise<void>
): Promise<void> {
    let server: RunningExampleServer | null = null;
    try {
        server = await startExampleServer({
            exampleDir: harnessDir,
            healthPath: '/api',
            env: { ...process.env, TEST_MW: mw },
            acceptedStatuses:
                mw === 'jwt-auth' || mw === 'api-key-auth' ? [401] : [200],
        });
        await fn(server.baseUrl);
    } finally {
        await stopExampleServer(server);
    }
}

describe('ecosystem middleware harness', () => {
    it('cors: allows origin and sets CORS headers', async () => {
        await withHarness('cors', async (base) => {
            const res = await fetch(`${base}/api`, {
                headers: { Origin: 'https://example.com' },
            });
            expect(res.ok).toBe(true);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
        });
    });

    it('logger: request succeeds', async () => {
        await withHarness('logger', async (base) => {
            const res = await fetch(`${base}/api`);
            expect(res.ok).toBe(true);
        });
    });

    it('rate-limiter: returns 429 after burst', async () => {
        await withHarness('rate-limiter', async (base) => {
            const statuses: number[] = [];
            for (let i = 0; i < 4; i++) {
                const r = await fetch(`${base}/api`);
                statuses.push(r.status);
            }
            expect(statuses.some((s) => s === 429)).toBe(true);
        });
    });

    it('compression: may set encoding for large JSON', async () => {
        await withHarness('compression', async (base) => {
            const res = await fetch(`${base}/api?large=1`, {
                headers: { 'Accept-Encoding': 'gzip' },
            });
            expect(res.ok).toBe(true);
            const enc = res.headers.get('Content-Encoding');
            if (enc) {
                expect(['gzip', 'deflate']).toContain(enc);
            }
        });
    });

    it('security-headers: sets protective headers', async () => {
        await withHarness('security-headers', async (base) => {
            const res = await fetch(`${base}/api`);
            expect(res.ok).toBe(true);
            expect(res.headers.get('X-Frame-Options')).toBeTruthy();
        });
    });

    it('jwt-auth: rejects without token', async () => {
        await withHarness('jwt-auth', async (base) => {
            const res = await fetch(`${base}/api`);
            expect(res.status).toBe(401);
        });
    });

    it('api-key-auth: rejects without key', async () => {
        await withHarness('api-key-auth', async (base) => {
            const res = await fetch(`${base}/api`);
            expect(res.status).toBe(401);
        });
    });

    it('api-key-auth: accepts X-API-Key', async () => {
        await withHarness('api-key-auth', async (base) => {
            const res = await fetch(`${base}/api`, {
                headers: { 'X-API-Key': 'harness-key' },
            });
            expect(res.ok).toBe(true);
        });
    });

    it('timeout: slow route returns 408 when handler exceeds threshold', async () => {
        await withHarness('timeout', async (base) => {
            const res = await fetch(`${base}/api/slow`);
            expect(res.status).toBe(408);
        });
    });

    it('cache: sets Cache-Control', async () => {
        await withHarness('cache', async (base) => {
            const res = await fetch(`${base}/api`);
            expect(res.ok).toBe(true);
            expect(res.headers.get('Cache-Control')).toContain('max-age');
        });
    });

    it('body-size-limiter: rejects oversized body (stream mode)', async () => {
        await withHarness('body-size-limiter', async (base) => {
            const res = await fetch(`${base}/api`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blob: 'x'.repeat(500) }),
            });
            expect(res.status).toBe(413);
        });
    });
});
