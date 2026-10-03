/**
 * Portable builds copy the entry prelude into a temp options module and
 * rewrite its imports relative to the output dir. All specifier forms must
 * be rewritten: double quotes, `export ... from`, and dynamic `import()` —
 * not just single-quoted `from '...'`.
 */
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import { makeTempDir, removeDir } from './test-utils';

const createdDirs: string[] = [];

function project(files: Record<string, string>): string {
    const dir = makeTempDir('burger-rewrite-');
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

describe('portable build import rewriting', () => {
    it('rewrites double-quoted, export-from, and dynamic imports', async () => {
        const dir = project({
            'src/index.ts': [
                'import { helper } from "./lib/helper";',
                'export { thing } from "./lib/thing";',
                'const lazy = await import("./lib/lazy");',
                "import { Burger } from 'burger-api';",
                'const app = new Burger({ apiDir: "./src/api" });',
                'app.serve(4000);',
                'void helper;',
                'void lazy;',
            ].join('\n'),
            'src/api/hello/route.ts':
                'export function GET() { return Response.json({ ok: true }); }\n',
        });

        const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const result = await runVirtualEntryBuild({
                cwd: dir,
                entryFile: 'src/index.ts',
                outfile: '.build/cloudflare/index.ts',
                platformTarget: 'cloudflare',
            });
            expect(result.success).toBe(true);
        } finally {
            warnSpy.mockRestore();
        }

        const options = readFileSync(
            join(dir, '.build', 'cloudflare', '__burger_build_options__.ts'),
            'utf8'
        );
        // All three forms, with their original quote style, re-pointed from
        // src/ to the output dir. The old rewrite left these untouched.
        expect(options).toContain('from "../../src/lib/helper"');
        expect(options).toContain('from "../../src/lib/thing"');
        expect(options).toContain('import("../../src/lib/lazy")');
        expect(options).not.toContain('"./lib/helper"');
        expect(options).not.toContain('"./lib/thing"');
        expect(options).not.toContain('"./lib/lazy"');

        const entry = readFileSync(
            join(dir, '.build', 'cloudflare', 'index.ts'),
            'utf8'
        );
        // The generated entry's absolute imports are re-pointed too.
        expect(entry).not.toContain(dir.split('\\').join('/'));
        expect(entry).toContain("from '../../src/api/hello/route.ts'");
        expect(entry).toContain("from './__burger_build_options__.ts'");
    });
});
