/**
 * Parity tests: CLI scanner produces same route paths as framework conventions.
 */
import { describe, it, expect } from 'bun:test';
import { join } from 'path';
import { scanApiRoutes, scanPageRoutes } from '../src/utils/scanner';

const fixturesDir = join(import.meta.dir, 'fixtures', 'simple-api');
const parityFixturesDir = join(import.meta.dir, 'fixtures', 'parity-routes');
const conflictFixturesDir = join(import.meta.dir, 'fixtures', 'conflicts');

describe('scanApiRoutes', () => {
    it('converts file paths to route paths matching framework (static, dynamic, group)', async () => {
        const entries = await scanApiRoutes(fixturesDir, './api', '/api');

        const paths = entries.map((e) => e.routePath).sort();
        expect(paths).toContain('/api');
        expect(paths).toContain('/api/users/:id');

        expect(entries.find((e) => e.routePath === '/api')).toBeDefined();
        expect(entries.find((e) => e.routePath === '/api/users/:id')).toBeDefined();
        const dynamic = entries.find((e) => e.routePath === '/api/users/:id');
        expect(dynamic?.isWildcard).toBe(false);
    });

    it('returns empty array when apiDir does not exist', async () => {
        const entries = await scanApiRoutes(fixturesDir, './nonexistent', '/api');
        expect(entries).toEqual([]);
    });

    it('normalizes prefix and supports grouping + wildcard segments', async () => {
        const entries = await scanApiRoutes(parityFixturesDir, './api', '//api//');
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

});

describe('scanPageRoutes', () => {
    it('returns empty array when pageDir does not exist', async () => {
        const entries = await scanPageRoutes(fixturesDir, './pages', '/');
        expect(entries).toEqual([]);
    });

    it('converts page paths for index, dynamic, extension stripping, and grouping', async () => {
        const entries = await scanPageRoutes(parityFixturesDir, './pages', '//');
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
        const entries = await scanPageRoutes(parityFixturesDir, './pages', '/site/');
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
