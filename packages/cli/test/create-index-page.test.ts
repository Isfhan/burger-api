import { describe, it, expect } from 'bun:test';
import { generateIndexPage } from '../src/utils/templates';
import type { CreateOptions } from '../src/types';

describe('generateIndexPage', () => {
    it('uses custom apiPrefix, apiDir, and pageDir in hints and Try API link', () => {
        const options: CreateOptions = {
            name: 't-app-1',
            useApi: true,
            apiDir: 'backend',
            apiPrefix: '/api/v2',
            debug: true,
            usePages: true,
            pageDir: 'pages',
            pagePrefix: '/',
        };

        const html = generateIndexPage(options);

        expect(html).toContain('href="/api/v2"');
        expect(html).toContain('>Try API</a>');
        expect(html).toContain('<code>src/pages/index.html</code>');
        expect(html).toContain('<code>src/backend/route.ts</code>');
        expect(html).toContain('Your Project t-app-1 is ready');
    });

    it('uses defaults for dirs and prefix when omitted', () => {
        const options: CreateOptions = {
            name: 'my-app',
            useApi: true,
            usePages: true,
        };

        const html = generateIndexPage(options);

        expect(html).toContain('href="/api"');
        expect(html).toContain('<code>src/pages/index.html</code>');
        expect(html).toContain('<code>src/api/route.ts</code>');
    });

    it('omits Try API link and API file hint when useApi is false', () => {
        const options: CreateOptions = {
            name: 'pages-only',
            useApi: false,
            usePages: true,
            pageDir: 'site',
        };

        const html = generateIndexPage(options);

        expect(html).not.toContain('>Try API</a>');
        expect(html).not.toContain('route.ts');
        expect(html).toContain('<code>src/site/index.html</code>');
    });

    it('normalizes apiPrefix without leading slash for href', () => {
        const options: CreateOptions = {
            name: 'x',
            useApi: true,
            usePages: true,
            apiPrefix: 'api/v2',
        };

        const html = generateIndexPage(options);

        expect(html).toContain('href="/api/v2"');
    });
});
