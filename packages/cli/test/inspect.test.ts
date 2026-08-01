/**
 * inspect command — route scanning and convention detection.
 */
import { describe, it, expect } from 'bun:test';
import { join } from 'path';
import { scanApiRoutes, scanPageRoutes } from '../src/utils/scanner';
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
        const entries = await scanPageRoutes(simpleFixturesDir, './pages', '/');
        expect(entries).toEqual([]);
    });

    it('scanApiRoutes with parity fixtures covers dynamic + group routes', async () => {
        const entries = await scanApiRoutes(parityFixturesDir, './api', '/api');
        const paths = entries.map((e) => e.routePath).sort();
        expect(paths.some((p) => p.includes(':id'))).toBe(true);
        expect(paths.some((p) => p.includes('groups'))).toBe(true);
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
