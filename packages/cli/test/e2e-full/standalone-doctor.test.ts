/**
 * Full E2E: the standalone (compiled) CLI resolves the project's packages.
 * A compiled binary only finds `node_modules` on disk when it is built with
 * `autoloadPackageJson`, otherwise `doctor` reports `burger-api` as missing
 * on a correct project (B4).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'path';
import {
    REPO_ROOT,
    cleanupE2E,
    createFullProject,
    createLinkSandbox,
    e2eEnv,
    runCommand,
} from './helpers';

const T = 600_000;

let dir = '';
let binary = '';
let env: Record<string, string | undefined> = {};

beforeAll(async () => {
    const sandbox = await createLinkSandbox();
    env = e2eEnv(sandbox);
    dir = await createFullProject(sandbox, 'standalone-doctor');

    // Build with the real release script, so its compile options are tested.
    const platform =
        process.platform === 'win32'
            ? { arg: 'win', file: 'burger-api.exe' }
            : process.platform === 'darwin'
              ? process.arch === 'arm64'
                  ? { arg: 'mac', file: 'burger-api-mac' }
                  : { arg: 'mac-intel', file: 'burger-api-mac-intel' }
              : { arg: 'linux', file: 'burger-api-linux' };
    const cliDir = join(REPO_ROOT, 'packages/cli');
    const build = await runCommand(
        ['bun', 'run', 'scripts/build-executable.ts', platform.arg],
        { cwd: cliDir, timeoutMs: 300_000 }
    );
    expect(build.code).toBe(0);
    binary = join(cliDir, 'dist', platform.file);
}, T);

afterAll(() => cleanupE2E());

describe('standalone CLI binary', () => {
    it(
        'doctor passes on a correct project',
        async () => {
            const result = await runCommand([binary, 'doctor'], {
                cwd: dir,
                env,
                timeoutMs: 120_000,
            });
            const output = result.out + result.err;
            expect(output).not.toContain('not installed');
            expect(output).not.toContain('Cannot find package');
            expect(output).toContain('All checks passed');
            expect(result.code).toBe(0);
        },
        T
    );

    it(
        'doctor --json reports ok',
        async () => {
            const result = await runCommand([binary, 'doctor', '--json'], {
                cwd: dir,
                env,
                timeoutMs: 120_000,
            });
            expect(result.code).toBe(0);
            expect(JSON.parse(result.out).ok).toBe(true);
        },
        T
    );
});
