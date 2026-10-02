import { describe, it, expect } from 'bun:test';
import {
    generateIndexPage,
    generateSampleCss,
    generateSampleJs,
} from '../src/utils/templates';
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
        expect(html).toContain('<h1>t-app-1 is ready</h1>');
        expect(html).toContain('<p class="wordmark">Burger<span>API</span></p>');
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

    it('pages-only apps get no API card, docs button, or route command', () => {
        const html = generateIndexPage({
            name: 'site',
            useApi: false,
            usePages: true,
        });

        expect(html).not.toContain('Edit your API');
        expect(html).not.toContain('href="/docs"');
        expect(html).not.toContain('generate route');
        expect(html).toContain('data-copy="bun run build"');
    });

    it('every command has a copy button with the exact command', () => {
        const html = generateIndexPage({
            name: 'x',
            useApi: true,
            usePages: true,
        });

        expect(html).toContain('data-copy="burger-api add cors logger"');
        expect(html).toContain('data-copy="burger-api generate route users"');
        expect(html).toContain('data-copy="burger-api doctor"');
    });

    it('escapes the project name', () => {
        const html = generateIndexPage({
            name: '<script>x</script>',
            useApi: true,
            usePages: true,
        });

        expect(html).not.toContain('<script>x</script>');
        expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
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

describe('generateSampleCss / generateSampleJs', () => {
    it('is dark by default with a light theme behind the toggle', () => {
        const css = generateSampleCss();
        expect(css).toContain(":root:not([data-theme='light'])");
        expect(css).toContain('--bg: #09090b');
        expect(css).toContain('--bg: #f7f7f5');
        expect(css).toContain('prefers-reduced-motion');
    });

    it('wires copy buttons and the remembered theme toggle', () => {
        const js = generateSampleJs();
        expect(js).toContain("querySelectorAll('[data-copy]')");
        expect(js).toContain("localStorage.setItem('theme', next)");
    });

    it('applies a saved light theme before first paint', () => {
        const html = generateIndexPage({ name: 'x', useApi: true, usePages: true });
        expect(html).toContain('data-theme-toggle');
        const head = html.slice(0, html.indexOf('</head>'));
        expect(head).toContain('localStorage.getItem("theme")');
    });
});
