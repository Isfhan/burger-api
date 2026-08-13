/**
 * inspect command — route scanning and convention detection.
 */
import { afterEach, describe, it, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
    scanApiRoutes,
    scanPageRoutes,
    ensureAppDirEnv,
} from '../src/utils/scanner';
import { detectExportedHookNames } from '../src/utils/route-methods';

const simpleFixturesDir = join(import.meta.dir, 'fixtures', 'simple-api');
const parityFixturesDir = join(import.meta.dir, 'fixtures', 'parity-routes');

describe('inspect uses existing scanner', () => {
    it('scanApiRoutes discovers routes from fixtures', async () => {
        const entries = await scanApiRoutes(simpleFixturesDir, './api', '/api');
        expect(entries.length).toBeGreaterThan(0);
        const paths = entries.map((e) => e.routePath);
        expect(paths).toContain('/api');
    });

    it('scanPageRoutes returns empty for fixtures without pages', async () => {
        const entries = await scanPageRoutes(
            simpleFixturesDir,
            './src/pages',
            '/'
        );
        expect(entries).toEqual([]);
    });

    it('scanApiRoutes with parity fixtures covers dynamic + group routes', async () => {
        const entries = await scanApiRoutes(parityFixturesDir, './api', '/api');
        const paths = entries.map((e) => e.routePath).sort();
        expect(paths.some((p) => p.includes(':id'))).toBe(true);
        expect(paths.some((p) => p.includes('groups'))).toBe(true);
    });
});

describe('scan dir resolution (entry-relative fallback + fail-loud)', () => {
    const originalAppDir = process.env.BURGER_API_APP_DIR;

    afterEach(() => {
        if (originalAppDir === undefined) delete process.env.BURGER_API_APP_DIR;
        else process.env.BURGER_API_APP_DIR = originalAppDir;
    });

    it('resolves a bare apiDir under BURGER_API_APP_DIR (src/ layout)', async () => {
        const root = mkdtempSync(join(tmpdir(), 'burger-cli-scan-'));
        try {
            mkdirSync(join(root, 'src', 'api', 'users'), { recursive: true });
            writeFileSync(
                join(root, 'src', 'api', 'users', 'route.ts'),
                'export {};'
            );
            process.env.BURGER_API_APP_DIR = join(root, 'src');
            const entries = await scanApiRoutes(root, 'api', '/api');
            expect(entries.map((e) => e.routePath)).toEqual(['/api/users']);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('stays silent for convention-default dirs that are missing (pages-only app)', async () => {
        const root = mkdtempSync(join(tmpdir(), 'burger-cli-scan-'));
        try {
            delete process.env.BURGER_API_APP_DIR;
            const entries = await scanPageRoutes(root, './src/pages', '/');
            expect(entries).toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('fails loud for a custom apiDir that cannot be resolved', async () => {
        const root = mkdtempSync(join(tmpdir(), 'burger-cli-scan-'));
        try {
            delete process.env.BURGER_API_APP_DIR;
            await expect(
                scanApiRoutes(root, 'backend', '/api')
            ).rejects.toThrow(
                'Routes directory "backend" does not exist. Tried "./backend" (project root) and "./src/backend" (src/)'
            );
            await expect(
                scanApiRoutes(root, 'backend', '/api')
            ).rejects.toThrow('Check the apiDir option in burger.build.ts');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('ensureAppDirEnv derives the src/ dir from the entry file', () => {
        const root = mkdtempSync(join(tmpdir(), 'burger-cli-scan-'));
        const originalCwd = process.cwd();
        try {
            mkdirSync(join(root, 'src'), { recursive: true });
            writeFileSync(join(root, 'src', 'index.ts'), '');
            process.chdir(root);
            delete process.env.BURGER_API_APP_DIR;
            ensureAppDirEnv('src/index.ts');
            // Read through a cast: TS narrows process.env after `delete`.
            const appDir = process.env.BURGER_API_APP_DIR as string | undefined;
            expect(appDir).toBe(join(root, 'src'));
        } finally {
            process.chdir(originalCwd);
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('detectExportedHookNames', () => {
    it('returns undefined for non-existent file', async () => {
        const result = await detectExportedHookNames('/nonexistent/hooks.ts');
        expect(result).toBeUndefined();
    });

    it('returns undefined when no hooks exported', async () => {
        const tmpFile = join(import.meta.dir, '__tmp_no_hooks.ts');
        await Bun.write(tmpFile, 'export const x = 1;');
        const result = await detectExportedHookNames(tmpFile);
        expect(result).toBeUndefined();
        const { unlinkSync } = require('fs');
        unlinkSync(tmpFile);
    });
});
