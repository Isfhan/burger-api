/**
 * End-to-end tests for `burger-api inspect --json` and `doctor --json`:
 * spawns the real CLI against a temp project on disk, so tooling gets
 * exactly what it would get in practice.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { makeTempDir, removeDir, runCli } from './test-utils';

let projectDir = '';

async function writeFileEnsuringDir(path: string, content: string) {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, content);
}

beforeEach(async () => {
    projectDir = makeTempDir('burger-inspect-doctor-');
    await mkdir(join(projectDir, 'src', 'api', 'users'), { recursive: true });

    await writeFile(
        join(projectDir, 'package.json'),
        JSON.stringify({
            name: 'json-flag-fixture',
            dependencies: { 'burger-api': 'workspace:*' },
        })
    );
    await writeFile(join(projectDir, 'tsconfig.json'), '{}');
    await writeFile(join(projectDir, 'src', 'index.ts'), 'export {};');
    await writeFile(
        join(projectDir, 'src', 'api', 'route.ts'),
        'export async function GET() {}'
    );
    await writeFileEnsuringDir(
        join(projectDir, 'src', 'api', 'users', 'route.ts'),
        'export async function GET() {}\nexport async function POST() {}'
    );
    await writeFile(
        join(projectDir, 'src', 'api', 'users', 'schema.ts'),
        'export const POST = {};'
    );
    await writeFile(join(projectDir, 'src', 'plugins.ts'), 'export default () => {};');

    // An OS temp dir is outside the monorepo, so make the dependency a real
    // (minimal) install for `Bun.resolveSync('burger-api', cwd)`.
    await writeFileEnsuringDir(
        join(projectDir, 'node_modules', 'burger-api', 'package.json'),
        JSON.stringify({
            name: 'burger-api',
            version: '0.0.0',
            main: 'index.js',
        })
    );
    await writeFileEnsuringDir(
        join(projectDir, 'node_modules', 'burger-api', 'index.js'),
        'export {};'
    );
});

afterEach(() => {
    removeDir(projectDir);
});

describe('burger-api inspect --json', () => {
    test('emits a valid, versioned InspectResult matching the real project', async () => {
        const { exitCode, stdout, stderr } = await runCli(
            ['inspect', '--json'],
            { cwd: projectDir }
        );

        expect(exitCode).toBe(0);
        expect(stderr).toBe('');

        const result = JSON.parse(stdout);
        expect(result.version).toBe(1);
        expect(result.config.apiDir).toBeTruthy();
        expect(result.apiRoutes.length).toBe(2);

        const usersRoute = result.apiRoutes.find(
            (r: { routePath: string }) => r.routePath === '/api/users'
        );
        expect(usersRoute).toBeTruthy();
        expect(usersRoute.methods.sort()).toEqual(['GET', 'POST']);
        expect(usersRoute.hasSchema).toBe(true);
        expect(usersRoute.hasConfig).toBe(false);

        expect(result.plugins.pluginsFileFound).toBe(true);
        expect(result.conventionFiles.totalApiRoutes).toBe(2);
        expect(result.conventionFiles.schema).toBe(1);
    });

    test('emits JSON (not colored text) for the "not a project" error case too', async () => {
        const emptyDir = makeTempDir('burger-inspect-empty-');
        try {
            const { exitCode, stdout } = await runCli(['inspect', '--json'], {
                cwd: emptyDir,
            });
            expect(exitCode).toBe(1);
            const result = JSON.parse(stdout);
            expect(result.error).toContain('Not in a BurgerAPI project directory');
        } finally {
            removeDir(emptyDir);
        }
    });
});

describe('burger-api doctor --json', () => {
    test('emits a valid, versioned DoctorResult with ok: true for a healthy project', async () => {
        const { exitCode, stdout, stderr } = await runCli(
            ['doctor', '--json'],
            { cwd: projectDir }
        );

        expect(exitCode).toBe(0);
        expect(stderr).toBe('');

        const result = JSON.parse(stdout);
        expect(result.version).toBe(1);
        expect(result.ok).toBe(true);
        expect(result.errorCount).toBe(0);
        expect(Array.isArray(result.checks)).toBe(true);
        expect(
            result.checks.some(
                (c: { name: string; pass: boolean }) =>
                    c.name === 'package.json' && c.pass === true
            )
        ).toBe(true);
    });

    test('exit code and ok:false stay consistent for a broken project', async () => {
        // No package.json dependency on burger-api — a real, detectable issue.
        await writeFile(
            join(projectDir, 'package.json'),
            JSON.stringify({ name: 'broken' })
        );

        const { exitCode, stdout } = await runCli(['doctor', '--json'], {
            cwd: projectDir,
        });

        expect(exitCode).toBe(1);
        const result = JSON.parse(stdout);
        expect(result.ok).toBe(false);
        expect(result.errorCount).toBeGreaterThan(0);
        expect(
            result.checks.some(
                (c: { name: string; pass: boolean }) =>
                    c.name === 'burger-api installed' && c.pass === false
            )
        ).toBe(true);
    });
});
