/**
 * E2E: the real `burger-api create --local` command against a sandboxed
 * `bun link` store, so the developer's global links are never touched.
 * `bun install` always runs, so these tests need network (or a warm Bun
 * cache). Validation/early-exit paths are in `test/create-command.test.ts`.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from 'fs';
import { join, resolve } from 'path';
import { removeDir } from '../test-utils';
import { cleanupProjects, makeProjectDir, run } from './helpers';

const CLI_ENTRY = resolve(import.meta.dir, '../../src/index.ts');
const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');
const E2E_TIMEOUT = 240_000;

const tempDirs: string[] = [];

/** Sandboxed $BUN_INSTALL for `bun link` and the scaffold's install. */
function makeSandbox(prefix: string): string {
    const dir = mkdtempSync(join(REPO_ROOT, prefix));
    tempDirs.push(dir);
    return dir;
}

/** Registers a package in the sandboxed link store. */
async function bunLink(packageDir: string, store: string): Promise<void> {
    const result = await run(['bun', 'link'], packageDir, {
        BUN_INSTALL: store,
    });
    expect(result.code).toBe(0);
}

afterAll(() => {
    cleanupProjects();
    for (const dir of tempDirs) removeDir(dir);
    tempDirs.length = 0;
});

describe('E2E create --local', () => {
    it(
        'scaffolds link: dependencies and installs from the checkout',
        async () => {
            const store = makeSandbox('.e2e-link-store-');
            await bunLink(join(REPO_ROOT, 'packages', 'burger-api'), store);
            await bunLink(join(REPO_ROOT, 'packages', 'cli'), store);

            const parent = await makeProjectDir('burger-e2e-create-');
            const result = await run(
                [
                    'bun',
                    CLI_ENTRY,
                    'create',
                    'e2e-created-app',
                    '--yes',
                    '--no-skills',
                    '--local',
                ],
                parent,
                { BUN_INSTALL: store }
            );

            expect(result.code).toBe(0);
            expect(result.out).toContain('Local mode:');

            const project = join(parent, 'e2e-created-app');
            const pkg = JSON.parse(
                readFileSync(join(project, 'package.json'), 'utf8')
            ) as {
                dependencies: Record<string, string>;
                devDependencies: Record<string, string>;
                overrides?: unknown;
            };
            expect(pkg.dependencies['burger-api']).toBe('link:burger-api');
            expect(pkg.devDependencies['@burger-api/cli']).toBe(
                'link:@burger-api/cli'
            );
            expect(pkg.overrides).toBeUndefined();
            // The install step actually ran.
            expect(existsSync(join(project, 'node_modules'))).toBe(true);
        },
        E2E_TIMEOUT
    );

    it(
        'fails before scaffolding when the packages are not linked',
        async () => {
            const store = makeSandbox('.e2e-empty-store-');
            const parent = await makeProjectDir('burger-e2e-unlinked-');
            const result = await run(
                [
                    'bun',
                    CLI_ENTRY,
                    'create',
                    'unlinked-app',
                    '--yes',
                    '--no-skills',
                    '--local',
                ],
                parent,
                { BUN_INSTALL: store }
            );

            expect(result.code).toBe(1);
            expect(result.out + result.err).toContain('bun link');
            expect(existsSync(join(parent, 'unlinked-app'))).toBe(false);
        },
        E2E_TIMEOUT
    );

    it(
        'rolls the directory back when dependency installation fails',
        async () => {
            const store = makeSandbox('.e2e-link-store-');
            const fakeRoot = makeSandbox('.e2e-broken-src-');
            const fakeBurger = join(fakeRoot, 'burger-api');
            const fakeCli = join(fakeRoot, 'cli');
            mkdirSync(fakeBurger, { recursive: true });
            mkdirSync(fakeCli, { recursive: true });
            writeFileSync(
                join(fakeBurger, 'package.json'),
                JSON.stringify({ name: 'burger-api', version: '1.0.0-beta' })
            );
            writeFileSync(
                join(fakeCli, 'package.json'),
                JSON.stringify({
                    name: '@burger-api/cli',
                    version: '1.0.0-beta',
                })
            );
            await bunLink(fakeBurger, store);
            await bunLink(fakeCli, store);
            // A broken linked package makes `bun install` fail after the
            // scaffold wrote its files.
            writeFileSync(join(fakeBurger, 'package.json'), 'not json');

            const parent = await makeProjectDir('burger-e2e-create-fail-');
            const result = await run(
                [
                    'bun',
                    CLI_ENTRY,
                    'create',
                    'rollback-app',
                    '--yes',
                    '--no-skills',
                    '--local',
                ],
                parent,
                { BUN_INSTALL: store }
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
