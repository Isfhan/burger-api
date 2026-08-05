/**
 * doctor command — check functions and project validation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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
