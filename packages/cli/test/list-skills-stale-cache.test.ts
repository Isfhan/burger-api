/**
 * Real, end-to-end tests for `list`/`skills available`'s stale-cache
 * fallback (Phase D: cache ecosystem discovery so these commands don't
 * hit GitHub on every invocation, and degrade gracefully when GitHub is
 * unreachable). Points BURGER_API_REPO_OWNER at a repo that genuinely
 * does not exist — a real network call to a real, deterministic 404, not
 * a mock — so a live refresh always fails, and pre-warms the cache so
 * there's something to fall back to.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

const cliEntry = join(import.meta.dir, '..', 'src', 'index.ts');
const projectDir = join(import.meta.dir, '__tmp_list_skills_stale');
const cacheDir = join(import.meta.dir, '__tmp_list_skills_stale_cache');

async function runCliIn(
    cwd: string,
    args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn(['bun', cliEntry, ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            ...process.env,
            BURGER_API_CACHE_DIR: cacheDir,
            // A repo that does not exist — the live refresh this forces
            // always 404s, exercising the stale-fallback path for real.
            BURGER_API_REPO_OWNER: 'isfhan',
            BURGER_API_REPO_NAME: 'burger-api-does-not-exist-xyz',
        },
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
}

beforeEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(cacheDir, { recursive: true, force: true });
    await mkdir(projectDir, { recursive: true });
    await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(cacheDir, { recursive: true, force: true });
});

describe('list — stale cache fallback', () => {
    test('serves the cached component list and warns when GitHub is unreachable', async () => {
        await writeFile(
            join(cacheDir, 'component-list.json'),
            JSON.stringify({
                fetchedAt: Date.now() - 999_999_999, // long expired
                data: [{ name: 'cached-hook', kind: 'hook' }],
            })
        );

        const { exitCode, stdout } = await runCliIn(projectDir, ['list']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('cached list');
        expect(stdout).toContain('cached-hook');
    });

    test('with no cache at all, fails loud instead of showing an empty list', async () => {
        const { exitCode, stdout, stderr } = await runCliIn(projectDir, [
            'list',
        ]);

        expect(exitCode).not.toBe(0);
        // Fails loud (an error), never silently renders an empty table.
        expect(stdout + stderr).not.toContain('Available Hooks and Plugins');
    });
});

describe('skills available — stale cache fallback', () => {
    test('serves the cached skill list and warns when GitHub is unreachable', async () => {
        await writeFile(
            join(cacheDir, 'skill-list.json'),
            JSON.stringify({
                fetchedAt: Date.now() - 999_999_999,
                data: ['cached-skill'],
            })
        );

        const { exitCode, stdout } = await runCliIn(projectDir, [
            'skills',
            'available',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('cached list');
        expect(stdout).toContain('cached-skill');
    });
});
