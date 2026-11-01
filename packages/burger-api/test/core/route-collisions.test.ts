import { describe, it, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Burger } from '../../src/index';
import { PageRouter } from '../../src/core/page-router';

describe('route collisions fail at startup', () => {
    it('API route vs docs UI', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/docs',
                    handlers: { GET: () => Response.json({}) },
                },
            ],
        });
        await expect(burger.fetchHandler()).rejects.toThrow(/collision/i);
        await expect(burger.fetchHandler()).rejects.toThrow(/\/docs/);
    });

    it('API route vs openapi.json', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/openapi.json',
                    handlers: { GET: () => Response.json({}) },
                },
            ],
        });
        await expect(burger.fetchHandler()).rejects.toThrow(/collision/i);
    });

    it('API route vs page', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/about',
                    handlers: { GET: () => Response.json({}) },
                },
            ],
            pageRoutes: [
                { path: '/about', handler: () => new Response('page') },
            ],
        });
        await expect(burger.fetchHandler()).rejects.toThrow(/collision/i);
        await expect(burger.fetchHandler()).rejects.toThrow(/page/i);
    });

    it('page vs asset', async () => {
        const burger = new Burger({
            pageRoutes: [
                { path: '/assets/a.css', handler: () => new Response('page') },
            ],
            assetRoutes: [
                { path: '/assets/a.css', contentType: 'text/css', data: '' },
            ],
        });
        await expect(burger.fetchHandler()).rejects.toThrow(/collision/i);
    });
});

describe('PageRouter dynamic files and root path', () => {
    function makePagesDir(files: Record<string, string>): string {
        const root = mkdtempSync(join(tmpdir(), 'burger-pages-'));
        for (const [name, content] of Object.entries(files)) {
            const file = join(root, name);
            mkdirSync(join(file, '..'), { recursive: true });
            writeFileSync(file, content);
        }
        return root;
    }

    it('throws for two dynamic page files at the same level', async () => {
        const root = makePagesDir({
            '[a].tsx': 'export default () => new Response("a");',
            '[b].tsx': 'export default () => new Response("b");',
        });
        try {
            const router = new PageRouter(root, '');
            await expect(router.loadPages()).rejects.toThrow(
                /dynamic page/i
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('produces one root entry, never "//"', async () => {
        const root = makePagesDir({
            'index.tsx': 'export default () => new Response("home");',
        });
        try {
            const router = new PageRouter(root, '');
            await router.loadPages();
            const paths = router.pages.map((p) => p.path);
            expect(paths).toContain('/');
            expect(paths).not.toContain('//');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps the trailing-slash variant for non-root pages', async () => {
        const root = makePagesDir({
            'about.tsx': 'export default () => new Response("about");',
        });
        try {
            const router = new PageRouter(root, '');
            await router.loadPages();
            const paths = router.pages.map((p) => p.path).sort();
            expect(paths).toEqual(['/about', '/about/']);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
