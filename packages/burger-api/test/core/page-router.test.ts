import { describe, it, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PageRouter } from '../../src/core/page-router';

describe('PageRouter — missing directory', () => {
    it('throws a dynamic error at construction for a missing pagesDir', () => {
        const root = mkdtempSync(join(tmpdir(), 'burger-pages-'));
        const originalAppDir = process.env.BURGER_API_APP_DIR;
        try {
            delete process.env.BURGER_API_APP_DIR;
            const missing = join(root, 'pages');
            expect(() => new PageRouter(missing, '/')).toThrow(
                `Pages directory "${missing}" does not exist`
            );
            expect(() => new PageRouter(missing, '/')).toThrow(
                'Check the pageDir option in src/index.ts'
            );
        } finally {
            if (originalAppDir === undefined) {
                delete process.env.BURGER_API_APP_DIR;
            } else {
                process.env.BURGER_API_APP_DIR = originalAppDir;
            }
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('resolves relative pageDir under BURGER_API_APP_DIR (entry-relative fallback)', async () => {
        const root = mkdtempSync(join(tmpdir(), 'burger-pages-'));
        const originalCwd = process.cwd();
        const originalAppDir = process.env.BURGER_API_APP_DIR;
        try {
            mkdirSync(join(root, 'src', 'pages'), { recursive: true });
            writeFileSync(join(root, 'src', 'pages', 'index.html'), '<h1>x</h1>');
            process.env.BURGER_API_APP_DIR = join(root, 'src');
            process.chdir(root);
            const router = new PageRouter('pages', '/');
            await router.loadPages();
            // One page file → two entries (with and without trailing slash).
            expect(router.pages).toHaveLength(2);
        } finally {
            process.chdir(originalCwd);
            if (originalAppDir === undefined) {
                delete process.env.BURGER_API_APP_DIR;
            } else {
                process.env.BURGER_API_APP_DIR = originalAppDir;
            }
            rmSync(root, { recursive: true, force: true });
        }
    });
});
