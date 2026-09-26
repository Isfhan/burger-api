/**
 * End-to-end test for `generate hook/plugin`'s ecosystem-catalog hint.
 * Spawns the real CLI against a temp project with a pre-warmed cache (via
 * BURGER_API_CACHE_DIR), so it never touches the network.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

const cliEntry = join(import.meta.dir, '..', 'src', 'index.ts');
const projectDir = join(import.meta.dir, '__tmp_generate_ecosystem_hint');
const cacheDir = join(import.meta.dir, '__tmp_generate_ecosystem_hint_cache');

async function runCliIn(
    cwd: string,
    args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn(['bun', cliEntry, ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, BURGER_API_CACHE_DIR: cacheDir },
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

    await writeFile(
        join(projectDir, 'package.json'),
        JSON.stringify({
            name: 'hint-fixture',
            dependencies: { 'burger-api': '^1.0.0-beta' },
        })
    );

    // Pre-warm the cache with real catalog entries this repo ships.
    await writeFile(
        join(cacheDir, 'component-list.json'),
        JSON.stringify({
            fetchedAt: Date.now(),
            data: [
                { name: 'cors', kind: 'hook' },
                { name: 'jwt-auth', kind: 'plugin' },
            ],
        })
    );
});

afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(cacheDir, { recursive: true, force: true });
});

describe('generate hook/plugin — ecosystem catalog hint', () => {
    test('warns and suggests `add` when a real hook already exists under that name', async () => {
        const { exitCode, stdout } = await runCliIn(projectDir, [
            'generate',
            'hook',
            'cors',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('already exists in the ecosystem catalog');
        expect(stdout).toContain('burger-api add cors');
        // Non-blocking: the local stub is still created.
        expect(stdout).toContain('Hook "cors" created');
    });

    test('warns and suggests `add` when a real plugin already exists under that name', async () => {
        const { exitCode, stdout } = await runCliIn(projectDir, [
            'generate',
            'plugin',
            'jwt-auth',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('already exists in the ecosystem catalog');
        expect(stdout).toContain('burger-api add jwt-auth');
        expect(stdout).toContain('created');
    });

    test('says nothing when the name is not in the ecosystem catalog', async () => {
        const { exitCode, stdout } = await runCliIn(projectDir, [
            'generate',
            'hook',
            'my-totally-custom-hook',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).not.toContain('already exists in the ecosystem catalog');
        expect(stdout).toContain('Hook "my-totally-custom-hook" created');
    });
});
