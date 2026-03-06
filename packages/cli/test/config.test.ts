/**
 * Config resolution: conventions-first with optional burger.config override.
 */
import { describe, it, expect } from 'bun:test';
import { join } from 'path';
import { resolveBuildConfig } from '../src/utils/config';

describe('resolveBuildConfig', () => {
    it('returns convention defaults when no config file exists', async () => {
        const config = await resolveBuildConfig(join(import.meta.dir, 'fixtures', 'simple-api'));
        expect(config.apiDir).toBe('./src/api');
        expect(config.pageDir).toBe('./src/pages');
        expect(config.apiPrefix).toBe('/api');
        expect(config.pagePrefix).toBe('/');
    });

    it('loads overrides from burger.config.ts when present', async () => {
        const fixtureDir = join(import.meta.dir, 'fixtures', 'with-config');
        const config = await resolveBuildConfig(fixtureDir);
        expect(config.apiDir).toBe('./api');
        expect(config.pageDir).toBe('./pages');
        expect(config.apiPrefix).toBe('/api');
        expect(config.pagePrefix).toBe('/');
        expect(config.debug).toBe(true);
    });
});
