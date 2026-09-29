/**
 * End-to-end tests for `list`/`skills available`'s stale-cache fallback.
 * No network: HTTPS_PROXY points at a closed local port, so a live refresh
 * always fails; the cache is pre-warmed so there is something to fall back
 * to. The nonexistent repo name guards the case where a proxy is bypassed.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { makeTempDir, removeDir, runCli } from './test-utils';

let projectDir = '';
let cacheDir = '';

beforeEach(() => {
    projectDir = makeTempDir('burger-stale-cache-');
    cacheDir = makeTempDir('burger-stale-cache-cache-');
});

afterEach(() => {
    removeDir(projectDir);
    removeDir(cacheDir);
});

function runCliInProject(args: string[]) {
    return runCli(args, {
        cwd: projectDir,
        env: {
            BURGER_API_CACHE_DIR: cacheDir,
            // Closed local port — fetch fails immediately, no network.
            HTTPS_PROXY: 'http://127.0.0.1:9',
            // A nonexistent repo — live refresh 404s (or 403s when the
            // runner's IP is rate limited) if the proxy were bypassed.
            BURGER_API_REPO_OWNER: 'isfhan',
            BURGER_API_REPO_NAME: 'burger-api-does-not-exist-xyz',
        },
    });
}

describe('list — stale cache fallback', () => {
    test('serves the cached component list and warns when GitHub is unreachable', async () => {
        await writeFile(
            join(cacheDir, 'component-catalog.json'),
            JSON.stringify({
                fetchedAt: Date.now() - 999_999_999, // long expired
                data: [
                    {
                        name: 'cached-hook',
                        kind: 'hook',
                        description: 'A cached hook',
                    },
                ],
            })
        );

        const { exitCode, stdout } = await runCliInProject(['list']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('cached list');
        expect(stdout).toContain('cached-hook');
        expect(stdout).toContain('A cached hook');
        // No success marker when the data is stale.
        expect(stdout).not.toContain('Found available hooks and plugins');
    });

    test('with no cache at all, fails loud instead of showing an empty list', async () => {
        const { exitCode, stdout, stderr } = await runCliInProject(['list']);

        expect(exitCode).not.toBe(0);
        // Fails loud (an error), never silently renders an empty table.
        expect(stdout + stderr).not.toContain('Available Hooks and Plugins');
        expect(stdout + stderr).toContain(
            'Please check your internet connection and try again.'
        );
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

        const { exitCode, stdout } = await runCliInProject([
            'skills',
            'available',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('cached list');
        expect(stdout).toContain('cached-skill');
    });
});
