/**
 * Real, end-to-end tests for `burger-api inspect --json` and
 * `burger-api doctor --json` — spawns the actual CLI (same pattern as
 * `cli-process-exit.test.ts`) against a real temp project on disk, not an
 * in-process function call, so this exercises the exact thing an
 * agent/tool invoking the CLI would get.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

const cliEntry = join(import.meta.dir, '..', 'src', 'index.ts');
const projectDir = join(import.meta.dir, '__tmp_inspect_doctor_json');

async function runCliIn(
    cwd: string,
    args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn(['bun', cliEntry, ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env: process.env,
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
}

async function writeFileEnsuringDir(path: string, content: string) {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, content);
}

beforeEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
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
});

afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
});

describe('burger-api inspect --json', () => {
    test('emits a valid, versioned InspectResult matching the real project', async () => {
        const { exitCode, stdout, stderr } = await runCliIn(projectDir, [
            'inspect',
            '--json',
        ]);

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
        const emptyDir = join(import.meta.dir, '__tmp_inspect_json_empty');
        await rm(emptyDir, { recursive: true, force: true });
        await mkdir(emptyDir, { recursive: true });
        try {
            const { exitCode, stdout } = await runCliIn(emptyDir, [
                'inspect',
                '--json',
            ]);
            expect(exitCode).toBe(1);
            const result = JSON.parse(stdout);
            expect(result.error).toContain('Not in a BurgerAPI project directory');
        } finally {
            await rm(emptyDir, { recursive: true, force: true });
        }
    });
});

describe('burger-api doctor --json', () => {
    test('emits a valid, versioned DoctorResult with ok: true for a healthy project', async () => {
        const { exitCode, stdout, stderr } = await runCliIn(projectDir, [
            'doctor',
            '--json',
        ]);

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

        const { exitCode, stdout } = await runCliIn(projectDir, [
            'doctor',
            '--json',
        ]);

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
