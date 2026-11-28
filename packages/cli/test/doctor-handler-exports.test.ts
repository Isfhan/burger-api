/**
 * doctor — handler export warnings. A lowercase method export (`get`) or a
 * non-function uppercase export (`const POST = {}`) is ignored at runtime, so
 * the route answers 405. doctor reports it as a warning (never an error).
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { runChecks } from '../src/commands/doctor';
import { makeTempDir, removeDir, runCli } from './test-utils';

let tmpDir = '';
let caseNo = 0;
let originalAppDir: string | undefined;

beforeEach(async () => {
    originalAppDir = process.env.BURGER_API_APP_DIR;
    delete process.env.BURGER_API_APP_DIR;
    tmpDir = makeTempDir('burger-doctor-handlers-');
    // An OS temp dir is outside the monorepo, so make the dependency a real
    // (minimal) install for `Bun.resolveSync('burger-api', cwd)`.
    await mkdir(join(tmpDir, 'node_modules', 'burger-api'), {
        recursive: true,
    });
    await writeFile(
        join(tmpDir, 'node_modules', 'burger-api', 'package.json'),
        JSON.stringify({
            name: 'burger-api',
            version: '0.0.0',
            main: 'index.js',
        })
    );
    await writeFile(
        join(tmpDir, 'node_modules', 'burger-api', 'index.js'),
        'export {};'
    );
});

afterEach(() => {
    removeDir(tmpDir);
    if (originalAppDir === undefined) delete process.env.BURGER_API_APP_DIR;
    else process.env.BURGER_API_APP_DIR = originalAppDir;
});

/** A project with the baseline files doctor expects, plus `files`. */
async function makeProject(files: Record<string, string>): Promise<string> {
    const dir = join(tmpDir, `case-${++caseNo}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
            name: 'test',
            dependencies: { 'burger-api': '^1.0.0' },
        })
    );
    await writeFile(join(dir, 'tsconfig.json'), '{}');
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'index.ts'), 'export {};');
    for (const [rel, content] of Object.entries(files)) {
        const file = join(dir, rel);
        await mkdir(join(file, '..'), { recursive: true });
        await writeFile(file, content);
    }
    return dir;
}

function handlerWarnings(
    results: Awaited<ReturnType<typeof runChecks>>,
    file: string
) {
    return results.filter(
        (r) =>
            r.severity === 'warning' &&
            r.pass &&
            r.message.includes(file)
    );
}

describe('doctor handler export warnings', () => {
    it('warns about a lowercase handler export and names the fix', async () => {
        const dir = await makeProject({
            'src/api/users/route.ts':
                'export async function get() { return new Response("ok"); }',
        });

        const results = await runChecks(dir);
        const warnings = handlerWarnings(results, 'src/api/users/route.ts');

        expect(warnings).toHaveLength(1);
        expect(warnings[0]!.message).toContain('export "get"');
        expect(warnings[0]!.message).toContain(
            'Handler exports must be uppercase: GET'
        );
        expect(results.filter((r) => !r.pass)).toEqual([]);
    });

    it('warns about a non-function uppercase method export', async () => {
        const dir = await makeProject({
            'src/api/users/route.ts': 'export const POST = {};',
        });

        const results = await runChecks(dir);
        const warnings = handlerWarnings(results, 'src/api/users/route.ts');

        expect(warnings).toHaveLength(1);
        expect(warnings[0]!.message).toContain('export "POST"');
        expect(warnings[0]!.message).toContain('is not a function');
        expect(warnings[0]!.message).toContain(
            'export async function POST(ctx)'
        );
        expect(results.filter((r) => !r.pass)).toEqual([]);
    });

    it('does not warn about valid uppercase function exports', async () => {
        const dir = await makeProject({
            'src/api/users/route.ts':
                'export async function GET() { return new Response("ok"); }',
        });

        const results = await runChecks(dir);

        expect(handlerWarnings(results, 'src/api/users/route.ts')).toEqual([]);
    });

    it('reports the warning in --json without changing the exit code', async () => {
        const dir = await makeProject({
            'src/api/legacy/route.ts':
                'export async function get() { return new Response("ok"); }',
        });

        const { exitCode, stdout } = await runCli(['doctor', '--json'], {
            cwd: dir,
        });

        expect(exitCode).toBe(0);
        const result = JSON.parse(stdout);
        expect(result.ok).toBe(true);
        expect(result.errorCount).toBe(0);

        const warnings = result.checks.filter(
            (c: { severity?: string; pass: boolean; message: string }) =>
                c.severity === 'warning' &&
                c.pass === true &&
                c.message.includes('src/api/legacy/route.ts')
        );
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain('export "get"');
        expect(warnings[0].message).toContain(
            'Handler exports must be uppercase: GET'
        );
    });
});
