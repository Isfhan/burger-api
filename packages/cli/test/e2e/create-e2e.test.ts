/**
 * E2E: the real `burger-api create` command. It always runs `bun install`,
 * so it cannot run in the offline default suite; these tests need network (or
 * a warm Bun cache). Validation/early-exit paths are in
 * `test/create-command.test.ts`.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from 'fs';
import { join, resolve } from 'path';
import { removeDir } from '../test-utils';
import {
    LOCAL_BURGER_API_PATH,
    cleanupProjects,
    makeProjectDir,
    run,
} from './helpers';

const CLI_ENTRY = resolve(import.meta.dir, '../../src/index.ts');
const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const E2E_TIMEOUT = 240_000;

const sourceRoots: string[] = [];

/**
 * A local package source root for `create`: `burger-api` links to the real
 * checkout, `@burger-api/cli` is a dependency-free stub. The real CLI
 * package's own `burger-api` range is unpublished, which would make
 * `bun install` fail. The root lives on the checkout's drive: on Windows,
 * `file:` sources under the OS temp dir fail to install with bun 1.4.x.
 */
function makeSourceRoot(): string {
    const root = mkdtempSync(join(REPO_ROOT, '.e2e-create-src-'));
    sourceRoots.push(root);
    symlinkSync(
        LOCAL_BURGER_API_PATH,
        join(root, 'burger-api'),
        process.platform === 'win32' ? 'junction' : 'dir'
    );
    mkdirSync(join(root, 'cli'));
    writeFileSync(
        join(root, 'cli', 'package.json'),
        JSON.stringify(
            { name: '@burger-api/cli', version: '1.0.0-beta' },
            null,
            2
        )
    );
    return root;
}

afterAll(() => {
    cleanupProjects();
    for (const root of sourceRoots) {
        // Remove the link itself, not the real package it points at.
        const link = join(root, 'burger-api');
        if (existsSync(link)) unlinkSync(link);
        removeDir(root);
    }
    sourceRoots.length = 0;
});

describe('E2E create', () => {
    it(
        'scaffolds the project and installs its dependencies',
        async () => {
            const parent = await makeProjectDir('burger-e2e-create-');
            const result = await run(
                [
                    'bun',
                    CLI_ENTRY,
                    'create',
                    'e2e-created-app',
                    '--yes',
                    '--no-skills',
                ],
                parent,
                { BURGER_API_SOURCE: join(makeSourceRoot(), 'burger-api') }
            );

            expect(result.code).toBe(0);
            expect(result.out).toContain('Project created successfully!');

            const project = join(parent, 'e2e-created-app');
            expect(existsSync(join(project, 'package.json'))).toBe(true);
            expect(existsSync(join(project, 'tsconfig.json'))).toBe(true);
            expect(existsSync(join(project, 'burger.build.ts'))).toBe(true);
            expect(existsSync(join(project, 'AGENTS.md'))).toBe(true);
            expect(existsSync(join(project, 'src', 'index.ts'))).toBe(true);
            expect(existsSync(join(project, 'src', 'api', 'route.ts'))).toBe(
                true
            );
            // The install step actually ran.
            expect(existsSync(join(project, 'node_modules'))).toBe(true);
        },
        E2E_TIMEOUT
    );

    it(
        'rolls the directory back when dependency installation fails',
        async () => {
            const parent = await makeProjectDir('burger-e2e-create-fail-');
            const result = await run(
                [
                    'bun',
                    CLI_ENTRY,
                    'create',
                    'rollback-app',
                    '--yes',
                    '--no-skills',
                ],
                parent,
                // A nonexistent local package makes `bun install` fail.
                {
                    BURGER_API_SOURCE: join(
                        parent,
                        'does-not-exist-burger-api'
                    ),
                }
            );

            expect(result.code).toBe(1);
            expect(result.out + result.err).toContain(
                'Failed to create project'
            );
            // Rollback: no half-created project left to trip up a retry.
            expect(existsSync(join(parent, 'rollback-app'))).toBe(false);
        },
        E2E_TIMEOUT
    );
});
