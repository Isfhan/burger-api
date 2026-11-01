/**
 * GitHub ecosystem caches must be scoped to owner/repo/branch: the default
 * branch (main) and a BURGER_API_BRANCH override must never share a cache entry.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ecosystemCacheKey } from '../src/utils/ecosystem-cache';
import { withMockedFetch } from './test-utils';

let cacheDir: string;
const originalCacheDir = process.env.BURGER_API_CACHE_DIR;
const originalBranch = process.env.BURGER_API_BRANCH;

beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'burger-cache-key-'));
    process.env.BURGER_API_CACHE_DIR = cacheDir;
});

afterEach(() => {
    if (originalCacheDir === undefined) delete process.env.BURGER_API_CACHE_DIR;
    else process.env.BURGER_API_CACHE_DIR = originalCacheDir;
    if (originalBranch === undefined) delete process.env.BURGER_API_BRANCH;
    else process.env.BURGER_API_BRANCH = originalBranch;
    rmSync(cacheDir, { recursive: true, force: true });
});

/** Fresh module instance, so the branch is recomputed at load time. */
async function importFreshGithub(): Promise<
    typeof import('../src/utils/github')
> {
    const spec = `../src/utils/github.ts?cache-key-test-${Math.random()
        .toString(36)
        .slice(2)}`;
    return (await import(spec)) as typeof import('../src/utils/github');
}

describe('ecosystemCacheKey', () => {
    it('scopes keys to owner, repo, and branch', () => {
        const base = { owner: 'isfhan', repo: 'burger-api', branch: 'main' };
        const key = ecosystemCacheKey('component-list', base);

        expect(
            ecosystemCacheKey('component-list', {
                ...base,
                branch: 'feat/next',
            })
        ).not.toBe(key);
        expect(
            ecosystemCacheKey('component-list', { ...base, owner: 'someone' })
        ).not.toBe(key);
        expect(
            ecosystemCacheKey('component-list', { ...base, repo: 'fork' })
        ).not.toBe(key);
    });

    it('encodes branch slashes into a filename-safe key', () => {
        const key = ecosystemCacheKey('skill-list', {
            owner: 'isfhan',
            repo: 'burger-api',
            branch: 'feat/next',
        });
        expect(key).not.toContain('/');
        expect(key).not.toContain('\\');
        expect(key).toContain('feat%2Fnext');
    });
});

describe('GitHub cache scoping', () => {
    it('never shares entries between main and a branch override', async () => {
        delete process.env.BURGER_API_BRANCH;
        const main = await importFreshGithub();
        await withMockedFetch(
            () => Response.json([]),
            () => main.getCachedSkillList()
        );

        process.env.BURGER_API_BRANCH = 'custom-branch';
        const custom = await importFreshGithub();
        await withMockedFetch(
            () => Response.json([]),
            () => custom.getCachedSkillList()
        );

        const files = readdirSync(cacheDir).sort();
        expect(files.length).toBe(2);
        expect(files.some((f) => f.includes('-main'))).toBe(true);
        expect(files.some((f) => f.includes('custom-branch'))).toBe(true);
    });
});
