/**
 * Real tests for the ecosystem TTL-file cache — no mocked fs, an isolated
 * temp directory per test (via BURGER_API_CACHE_DIR) so nothing touches a
 * real home directory.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { withEcosystemCache } from '../src/utils/ecosystem-cache';

let cacheDir: string;
const originalEnv = process.env.BURGER_API_CACHE_DIR;

beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'burger-cli-cache-'));
    process.env.BURGER_API_CACHE_DIR = cacheDir;
});

afterEach(() => {
    if (originalEnv === undefined) delete process.env.BURGER_API_CACHE_DIR;
    else process.env.BURGER_API_CACHE_DIR = originalEnv;
    rmSync(cacheDir, { recursive: true, force: true });
});

describe('withEcosystemCache', () => {
    test('cold cache: fetches fresh, writes the cache file, returns stale: false', async () => {
        let callCount = 0;
        const result = await withEcosystemCache('test-key', async () => {
            callCount++;
            return { value: 'fresh' };
        });

        expect(result).toEqual({ data: { value: 'fresh' }, stale: false });
        expect(callCount).toBe(1);
        expect(existsSync(join(cacheDir, 'test-key.json'))).toBe(true);
    });

    test('fresh cache: serves from disk without calling fetchFresh again', async () => {
        await withEcosystemCache('test-key', async () => ({ value: 'first' }));

        let secondCallCount = 0;
        const result = await withEcosystemCache(
            'test-key',
            async () => {
                secondCallCount++;
                return { value: 'second' };
            },
            60_000 // 1 minute TTL — well within range for this immediate re-read
        );

        expect(result).toEqual({ data: { value: 'first' }, stale: false });
        expect(secondCallCount).toBe(0);
    });

    test('expired cache + successful refetch: returns fresh data, stale: false', async () => {
        await withEcosystemCache('test-key', async () => ({ value: 'old' }));

        // TTL of 0ms — the cache written a moment ago is already "expired".
        const result = await withEcosystemCache(
            'test-key',
            async () => ({ value: 'new' }),
            0
        );

        expect(result).toEqual({ data: { value: 'new' }, stale: false });
    });

    test('expired cache + failing refetch: falls back to the stale data, stale: true', async () => {
        await withEcosystemCache('test-key', async () => ({ value: 'old' }));

        const result = await withEcosystemCache<{ value: string }>(
            'test-key',
            async () => {
                throw new Error('GitHub is down');
            },
            0
        );

        expect(result).toEqual({ data: { value: 'old' }, stale: true });
    });

    test('cold cache + failing fetch: throws — there is genuinely nothing to serve', async () => {
        await expect(
            withEcosystemCache<{ value: string }>('test-key', async () => {
                throw new Error('GitHub is down');
            })
        ).rejects.toThrow('GitHub is down');
    });

    test('a corrupt cache file is treated as absent, not a crash', async () => {
        const { writeFileSync, mkdirSync } = await import('fs');
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(join(cacheDir, 'test-key.json'), '{ not valid json');

        const result = await withEcosystemCache('test-key', async () => ({
            value: 'recovered',
        }));

        expect(result).toEqual({ data: { value: 'recovered' }, stale: false });
    });

    test('cached file is a real JSON envelope with fetchedAt + data', async () => {
        await withEcosystemCache('test-key', async () => ({ value: 'x' }));

        const raw = JSON.parse(
            readFileSync(join(cacheDir, 'test-key.json'), 'utf-8')
        );
        expect(typeof raw.fetchedAt).toBe('number');
        expect(raw.data).toEqual({ value: 'x' });
    });
});
