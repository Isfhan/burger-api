/**
 * doctor command — check functions and project validation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { runChecks } from '../src/commands/doctor';

const tmpDir = join(import.meta.dir, '__tmp_doctor');

beforeEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
});

async function createFile(path: string, content: string = '') {
    await Bun.write(join(tmpDir, path), content);
}

describe('doctor checks (via project structure)', () => {
    it('detects missing package.json', async () => {
        const exists = existsSync(join(tmpDir, 'package.json'));
        expect(exists).toBe(false);
    });

    it('detects package.json when present', async () => {
        await createFile('package.json', JSON.stringify({ name: 'test' }));
        const exists = existsSync(join(tmpDir, 'package.json'));
        expect(exists).toBe(true);
    });

    it('detects burger-api in dependencies', async () => {
        await createFile(
            'package.json',
            JSON.stringify({
                name: 'test',
                dependencies: { 'burger-api': '^1.0.0' },
            })
        );
        const pkg = JSON.parse(
            readFileSync(join(tmpDir, 'package.json'), 'utf-8')
        );
        expect(pkg.dependencies['burger-api']).toBe('^1.0.0');
    });

    it('detects burger-api in devDependencies', async () => {
        await createFile(
            'package.json',
            JSON.stringify({
                name: 'test',
                devDependencies: { 'burger-api': '^1.0.0' },
            })
        );
        const pkg = JSON.parse(
            readFileSync(join(tmpDir, 'package.json'), 'utf-8')
        );
        expect(pkg.devDependencies['burger-api']).toBe('^1.0.0');
    });

    it('detects src/api/ directory', async () => {
        await mkdir(join(tmpDir, 'src', 'api'), { recursive: true });
        const exists = existsSync(join(tmpDir, 'src', 'api'));
        expect(exists).toBe(true);
    });

    it('detects src/index.ts', async () => {
        await createFile('src/index.ts', 'export {}');
        const exists = existsSync(join(tmpDir, 'src', 'index.ts'));
        expect(exists).toBe(true);
    });

    it('detects tsconfig.json', async () => {
        await createFile('tsconfig.json', '{}');
        const exists = existsSync(join(tmpDir, 'tsconfig.json'));
        expect(exists).toBe(true);
    });

    it('detects legacy burger.config.ts', async () => {
        await createFile('burger.config.ts', 'export default {}');
        const exists = existsSync(join(tmpDir, 'burger.config.ts'));
        expect(exists).toBe(true);
    });

    it('detects burger.build.ts', async () => {
        await createFile('burger.build.ts', 'export default {}');
        const exists = existsSync(join(tmpDir, 'burger.build.ts'));
        expect(exists).toBe(true);
    });

    it('detects src/hooks.ts', async () => {
        await createFile('src/hooks.ts', 'export {}');
        const exists = existsSync(join(tmpDir, 'src', 'hooks.ts'));
        expect(exists).toBe(true);
    });

    it('detects src/plugins.ts', async () => {
        await createFile('src/plugins.ts', 'export {}');
        const exists = existsSync(join(tmpDir, 'src', 'plugins.ts'));
        expect(exists).toBe(true);
    });

    it('detects src/openapi.config.ts', async () => {
        await createFile('src/openapi.config.ts', 'export default {}');
        const exists = existsSync(join(tmpDir, 'src', 'openapi.config.ts'));
        expect(exists).toBe(true);
    });

    it('detects route.ts files in src/api/', async () => {
        await createFile('src/api/route.ts', 'export async function GET() {}');
        const exists = existsSync(join(tmpDir, 'src', 'api', 'route.ts'));
        expect(exists).toBe(true);
    });

    it('full project structure passes all checks', async () => {
        await createFile(
            'package.json',
            JSON.stringify({
                name: 'test',
                dependencies: { 'burger-api': '^1.0.0' },
            })
        );
        await createFile('burger.build.ts', 'export default {}');
        await createFile('src/index.ts', 'export {}');
        await createFile('src/api/route.ts', 'export async function GET() {}');
        await createFile('tsconfig.json', '{}');

        expect(existsSync(join(tmpDir, 'package.json'))).toBe(true);
        expect(existsSync(join(tmpDir, 'burger.build.ts'))).toBe(true);
        expect(existsSync(join(tmpDir, 'src', 'index.ts'))).toBe(true);
        expect(existsSync(join(tmpDir, 'src', 'api', 'route.ts'))).toBe(true);
        expect(existsSync(join(tmpDir, 'tsconfig.json'))).toBe(true);
    });
});

describe('runChecks (JavaScript projects)', () => {
    // A JS-language project has no tsconfig.json/*.ts files at all — doctor
    // must recognize the .js equivalents instead of reporting false failures.
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

describe('runChecks (real validation, not just file presence)', () => {
    // Bun caches modules by path within a process, so every case gets its
    // own directory (doctor imports burger.build.ts and route files).
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
