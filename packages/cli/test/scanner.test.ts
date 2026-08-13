/**
 * Parity tests: CLI scanner produces same route paths as framework conventions.
 */
import { describe, it, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanApiRoutes, scanPageRoutes } from '../src/utils/scanner';

const fixturesDir = join(import.meta.dir, 'fixtures', 'simple-api');
const parityFixturesDir = join(import.meta.dir, 'fixtures', 'parity-routes');
const conflictFixturesDir = join(import.meta.dir, 'fixtures', 'conflicts');
const namedWildcardFixturesDir = join(
    import.meta.dir,
    'fixtures',
    'named-wildcard'
);
const routeMethodsFixturesDir = join(
    import.meta.dir,
    'fixtures',
    'route-methods'
);
const jsRoutesFixturesDir = join(import.meta.dir, 'fixtures', 'js-routes');

describe('scanApiRoutes', () => {
    it('converts file paths to route paths matching framework (static, dynamic, group)', async () => {
        const entries = await scanApiRoutes(fixturesDir, './api', '/api');

        const paths = entries.map((e) => e.routePath).sort();
        expect(paths).toContain('/api');
        expect(paths).toContain('/api/users/:id');

        expect(entries.find((e) => e.routePath === '/api')).toBeDefined();
        expect(
            entries.find((e) => e.routePath === '/api/users/:id')
        ).toBeDefined();
        const dynamic = entries.find((e) => e.routePath === '/api/users/:id');
        expect(dynamic?.isWildcard).toBe(false);
    });

    it('fails loud when a custom apiDir does not exist', async () => {
        await expect(
            scanApiRoutes(fixturesDir, './nonexistent', '/api')
        ).rejects.toThrow(
            'Routes directory "./nonexistent" does not exist'
        );
        await expect(
            scanApiRoutes(fixturesDir, './nonexistent', '/api')
        ).rejects.toThrow('Check the apiDir option in burger.build.ts');
    });

    it('normalizes prefix and supports grouping + wildcard segments', async () => {
        const entries = await scanApiRoutes(
            parityFixturesDir,
            './api',
            '//api//'
        );
        const paths = entries.map((e) => e.routePath).sort();

        expect(paths).toEqual([
            '/api/files/*',
            '/api/groups/users',
            '/api/root',
            '/api/users/:id',
        ]);
    });

    it('throws when dynamic and wildcard folders are mixed at same level', async () => {
        await expect(
            scanApiRoutes(conflictFixturesDir, './api-mixed', '/api')
        ).rejects.toThrow('Cannot mix');
    });

    it('throws when multiple dynamic folders exist at same level', async () => {
        await expect(
            scanApiRoutes(conflictFixturesDir, './api-two-dynamic', '/api')
        ).rejects.toThrow('Multiple dynamic route folders');
    });

    it('ignores unsupported [...slug] folders entirely', async () => {
        const entries = await scanApiRoutes(
            namedWildcardFixturesDir,
            './api',
            '/api'
        );
        expect(entries).toHaveLength(0);
    });

    it('sets methods on entries when route file exports specific HTTP methods', async () => {
        const entries = await scanApiRoutes(
            routeMethodsFixturesDir,
            'get-only',
            '/api'
        );
        expect(entries).toHaveLength(1);
        const entry = entries[0];
        if (!entry) throw new Error('expected one entry');
        expect(entry.routePath).toBe('/api');
        expect(entry.methods).toEqual(['GET']);
    });

    it('sets methods for multiple exported methods', async () => {
        const entries = await scanApiRoutes(
            routeMethodsFixturesDir,
            '.',
            '/api'
        );
        const rootEntry = entries.find((e) => e.routePath === '/api');
        expect(rootEntry).toBeDefined();
        if (!rootEntry) throw new Error('expected root entry');
        expect(rootEntry.methods).toEqual(
            expect.arrayContaining(['GET', 'POST'])
        );
        expect(rootEntry.methods).toHaveLength(2);
    });
});

describe('scanApiRoutes — JavaScript (.js / .mjs)', () => {
    it('discovers route.js with .js convention siblings', async () => {
        const entries = await scanApiRoutes(
            jsRoutesFixturesDir,
            './api',
            '/api'
        );
        const users = entries.find((e) => e.routePath === '/api/users');
        expect(users).toBeDefined();
        expect(users?.importPath).toContain('route.js');
        expect(users?.schemaPath).toContain('schema.js');
        expect(users?.configPath).toContain('config.js');
        expect(users?.methods).toEqual(['GET']);
    });

    it('discovers route.mjs with .mjs convention siblings', async () => {
        const entries = await scanApiRoutes(
            jsRoutesFixturesDir,
            './api',
            '/api'
        );
        const files = entries.find((e) => e.routePath === '/api/files');
        expect(files).toBeDefined();
        expect(files?.importPath).toContain('route.mjs');
        expect(files?.openapiPath).toContain('openapi.mjs');
    });

    it('throws when route.ts and route.js coexist', async () => {
        const root = mkdtempSync(join(tmpdir(), 'burger-cli-scan-'));
        try {
            mkdirSync(join(root, 'api', 'users'), { recursive: true });
            writeFileSync(join(root, 'api', 'users', 'route.ts'), 'export {};');
            writeFileSync(join(root, 'api', 'users', 'route.js'), 'export {};');
            await expect(
                scanApiRoutes(root, './api', '/api')
            ).rejects.toThrow(/Conflicting convention files/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('scanPageRoutes', () => {
    it('stays silent for the default pageDir when missing (no pages app)', async () => {
        const entries = await scanPageRoutes(
            fixturesDir,
            './src/pages',
            '/'
        );
        expect(entries).toEqual([]);
    });

    it('fails loud for a custom pageDir that does not exist', async () => {
        await expect(
            scanPageRoutes(fixturesDir, './pages', '/')
        ).rejects.toThrow('Pages directory "./pages" does not exist');
    });

    it('converts page paths for index, dynamic, extension stripping, and grouping', async () => {
        const entries = await scanPageRoutes(
            parityFixturesDir,
            './pages',
            '//'
        );
        const paths = entries.map((e) => e.routePath).sort();

        expect(paths).toEqual([
            '/',
            '/about',
            '/blog/:slug',
            '/docs/guides/getting-started',
            '/landing',
        ]);
    });

    it('applies non-root page prefix consistently', async () => {
        const entries = await scanPageRoutes(
            parityFixturesDir,
            './pages',
            '/site/'
        );
        const paths = entries.map((e) => e.routePath).sort();

        expect(paths).toEqual([
            '/site',
            '/site/about',
            '/site/blog/:slug',
            '/site/docs/guides/getting-started',
            '/site/landing',
        ]);
    });

    it('throws when multiple dynamic page folders exist at same level', async () => {
        await expect(
            scanPageRoutes(conflictFixturesDir, './pages-two-dynamic', '/')
        ).rejects.toThrow('Multiple dynamic page folders');
    });
});
