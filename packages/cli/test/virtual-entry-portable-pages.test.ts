/**
 * Portable targets have no Bun `.html` loader. Deno refuses to import an HTML
 * file as a module ("identified a Unknown module"), and Cloudflare only works
 * because wrangler turns `.html` into a text module. The build entry must
 * embed page HTML at build time instead, in the same `{ default: text }`
 * shape page code receives from wrangler today.
 */
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { BuildConfig } from '../src/types/index';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import { generateVirtualEntrySource } from '../src/utils/virtual-entry';
import { makeTempDir, removeDir } from './test-utils';

const config: BuildConfig = {
    apiDir: './api',
    pageDir: './pages',
    apiPrefix: '/api',
    pagePrefix: '/',
    debug: false,
};

const createdDirs: string[] = [];

function project(files: Record<string, string>): string {
    const dir = makeTempDir('burger-portable-pages-');
    createdDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        const full = join(dir, rel);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
    }
    return dir;
}

afterEach(() => {
    for (const dir of createdDirs) removeDir(dir);
    createdDirs.length = 0;
});

const HTML = '<!DOCTYPE html><html><body><h1>Portable</h1></body></html>';

function pageEntries(dir: string, files: string[]) {
    return files.map((file) => ({
        importPath: join(dir, 'pages', file).split('\\').join('/'),
        routePath:
            file === 'index.html' ? '/' : `/${file.replace('.html', '')}`,
    }));
}

describe('virtual entry: portable targets embed HTML pages', () => {
    it('inlines .html pages for cloudflare, deno and vercel instead of importing them', () => {
        const dir = project({ 'pages/index.html': HTML });
        const pages = pageEntries(dir, ['index.html']);

        for (const target of ['cloudflare', 'deno', 'vercel'] as const) {
            const source = generateVirtualEntrySource(
                config,
                [],
                pages,
                undefined,
                undefined,
                [],
                [],
                false,
                target
            );

            expect(source).toContain(
                `const _p0 = { default: ${JSON.stringify(HTML)} };`
            );
            expect(source).not.toContain('import * as _p0');
            expect(source).not.toContain('index.html');
            // Still fed through __page, so the inline object yields the same
            // text/html Response factory as before.
            expect(source).toContain('handler: __page(_p0)');
        }
    });

    it('keeps .html imports for the bun and node targets', () => {
        const dir = project({ 'pages/index.html': HTML });
        const pages = pageEntries(dir, ['index.html']);

        for (const target of ['bun', 'node'] as const) {
            const source = generateVirtualEntrySource(
                config,
                [],
                pages,
                undefined,
                undefined,
                [],
                [],
                false,
                target
            );

            expect(source).toContain('import * as _p0 from');
            expect(source).toContain('index.html');
            expect(source).not.toContain('const _p0 =');
        }
    });

    it('keeps .tsx page imports for portable targets (they are real modules)', () => {
        const dir = project({
            'pages/index.tsx': 'export default () => new Response("tsx");',
        });
        const pages = [
            {
                importPath: join(dir, 'pages', 'index.tsx')
                    .split('\\')
                    .join('/'),
                routePath: '/',
            },
        ];

        const source = generateVirtualEntrySource(
            config,
            [],
            pages,
            undefined,
            undefined,
            [],
            [],
            false,
            'deno'
        );

        expect(source).toContain('import * as _p0 from');
        expect(source).toContain('index.tsx');
        expect(source).not.toContain('const _p0 =');
    });

    it('build --target=deno writes an entry with no .html import and the page text inlined', async () => {
        const dir = project({
            'src/index.ts': [
                "import { Burger } from 'burger-api';",
                "const app = new Burger({ apiDir: './src/api', pageDir: './src/pages' });",
                'app.serve(4000);',
            ].join('\n'),
            'src/api/route.ts':
                'export function GET() { return Response.json({ ok: true }); }',
            'src/pages/index.html': HTML,
        });
        const logSpy = spyOn(console, 'log').mockImplementation(() => {});
        try {
            const result = await runVirtualEntryBuild({
                cwd: dir,
                entryFile: 'src/index.ts',
                outfile: '.build/deno/index.ts',
                platformTarget: 'deno',
            });
            expect(result.success).toBe(true);
        } finally {
            logSpy.mockRestore();
        }

        const source = readFileSync(
            join(dir, '.build', 'deno', 'index.ts'),
            'utf-8'
        );
        expect(source).not.toContain('.html');
        expect(source).toContain(
            `const _p0 = { default: ${JSON.stringify(HTML)} };`
        );
    });
});
