/**
 * doctor command — check functions and project validation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { runChecks } from '../src/commands/doctor';
import { makeTempDir, removeDir } from './test-utils';

let tmpDir = '';
// `runChecks` -> `ensureAppDirEnv` sets BURGER_API_APP_DIR; keep it from
// leaking into other tests (and files) that read it.
let originalAppDir: string | undefined;

beforeEach(async () => {
    originalAppDir = process.env.BURGER_API_APP_DIR;
    tmpDir = makeTempDir('burger-doctor-');
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

async function createFile(path: string, content: string = '') {
    await Bun.write(join(tmpDir, path), content);
}

describe('runChecks (JavaScript projects)', () => {
    // JS projects have no tsconfig.json or .ts files; doctor must recognize
    // the .js equivalents instead of reporting false failures.
    it('passes src/index and tsconfig checks for a .js-only project', async () => {
        await createFile(
            'package.json',
            JSON.stringify({
                name: 'test',
                dependencies: { 'burger-api': '^1.0.0' },
            })
        );
        await createFile('burger.build.js', 'export default {};');
        await createFile('src/index.js', 'export {};');
        await createFile(
            'src/api/route.js',
            'export async function GET() {}'
        );
        await createFile('jsconfig.json', '{}');

        const results = await runChecks(tmpDir);
        const byName = (name: string) =>
            results.find((r) => r.name === name);

        expect(byName('src/index.js')?.pass).toBe(true);
        expect(byName('jsconfig.json')?.pass).toBe(true);
        expect(results.every((r) => r.pass)).toBe(true);
    });

    it('recognizes .js optional convention files instead of reporting them missing', async () => {
        await createFile(
            'package.json',
            JSON.stringify({ name: 'test', dependencies: {} })
        );
        await createFile('src/index.js', 'export {};');
        await createFile('src/hooks.js', 'export {};');
        await createFile('src/plugins.js', 'export {};');
        await createFile('src/openapi.config.js', 'export default {};');

        const results = await runChecks(tmpDir);
        const byName = (name: string) =>
            results.find((r) => r.name === name);

        expect(byName('src/hooks.js')?.message).toContain('Found');
        expect(byName('src/plugins.js')?.message).toContain('Found');
        expect(byName('src/openapi.config.js')?.message).toContain('Found');
    });
});

describe('runChecks (burger-api dependency state)', () => {
    it('fails when burger-api is listed in package.json but not installed', async () => {
        await createFile(
            'package.json',
            JSON.stringify({
                name: 'test',
                dependencies: { 'burger-api': '^1.0.0' },
            })
        );
        removeDir(join(tmpDir, 'node_modules'));

        const results = await runChecks(tmpDir);
        const installed = results.find((r) => r.name === 'burger-api installed');

        expect(installed?.pass).toBe(false);
        expect(installed?.message).toContain('but not installed');
    });
});

describe('runChecks (real validation, not just file presence)', () => {
    // Bun caches modules by path, so each case gets its own directory
    // (doctor imports burger.build.ts and route files).
    let caseDir = '';
    let caseNo = 0;
    beforeEach(async () => {
        caseDir = join(tmpDir, `case-${++caseNo}`);
        await mkdir(caseDir, { recursive: true });
    });
    const put = (path: string, content: string) =>
        Bun.write(join(caseDir, path), content);

    const pkg = JSON.stringify({
        name: 'test',
        dependencies: { 'burger-api': '^1.0.0' },
    });

    it('uses the configured apiDir instead of hard-coding src/api', async () => {
        await put('package.json', pkg);
        await put(
            'burger.build.ts',
            "export default { apiDir: './src/routes' };"
        );
        await put('src/index.ts', 'export {};');
        await put(
            'src/routes/route.ts',
            'export async function GET() { return new Response("ok"); }'
        );
        await put('tsconfig.json', '{}');

        const results = await runChecks(caseDir);
        const routes = results.find((r) => r.name === 'Route files');
        expect(routes?.pass).toBe(true);
        expect(routes?.message).toContain('src/routes/');
        expect(results.filter((r) => !r.pass)).toEqual([]);
    });

    it('a missing default apiDir is info (pages-only app), not a failure', async () => {
        await put('package.json', pkg);
        await put('src/index.ts', 'export {};');
        await put('tsconfig.json', '{}');

        const results = await runChecks(caseDir);
        const api = results.find((r) => r.name.startsWith('apiDir'));
        expect(api?.pass).toBe(true);
        expect(api?.severity).toBe('info');
    });

    it('fails when a route file has a syntax error', async () => {
        await put('package.json', pkg);
        await put('src/index.ts', 'export {};');
        await put('src/api/route.ts', 'export async function GET( {');

        const results = await runChecks(caseDir);
        const routes = results.find((r) => r.name === 'Route files');
        expect(routes?.pass).toBe(false);
        expect(routes?.message).toContain('src/api/route.ts');
    });

    it('fails when burger.build.ts cannot be loaded', async () => {
        await put('package.json', pkg);
        await put('burger.build.ts', 'export default { apiDir: ;');
        await put('src/index.ts', 'export {};');

        const results = await runChecks(caseDir);
        const build = results.find((r) => r.name === 'burger.build.ts');
        expect(build?.pass).toBe(false);
        expect(build?.message).toContain('Could not load');
    });

    it('warns when src/index.ts and burger.build.ts disagree', async () => {
        await put('package.json', pkg);
        await put(
            'burger.build.ts',
            "export default { apiDir: './src/api', apiPrefix: '/v2' };"
        );
        await put(
            'src/index.ts',
            "import { Burger } from 'burger-api';\nconst app = new Burger({ apiDir: './src/api', apiPrefix: '/api' });\n"
        );
        await put(
            'src/api/route.ts',
            'export async function GET() { return new Response("ok"); }'
        );

        const results = await runChecks(caseDir);
        const sync = results.find((r) => r.name.includes('↔'));
        expect(sync?.severity).toBe('warning');
        expect(sync?.message).toContain('apiPrefix');
    });

    it('optional files are reported as info, not success', async () => {
        await put('package.json', pkg);
        await put('src/index.ts', 'export {};');

        const results = await runChecks(caseDir);
        const hooks = results.find((r) => r.name === 'src/hooks');
        expect(hooks?.severity).toBe('info');
        expect(hooks?.message).toContain('optional');
    });
});
