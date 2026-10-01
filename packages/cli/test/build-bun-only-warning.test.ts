/**
 * Portable targets (Cloudflare, Deno, Vercel, Node) have no Bun globals.
 * The build must warn once about `bun`/`bun:*` imports and `Bun.` usage in
 * user source, and still produce the entry (warn, don't fail).
 */
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import { makeTempDir, removeDir } from './test-utils';

const createdDirs: string[] = [];

function project(files: Record<string, string>): string {
    const dir = makeTempDir('burger-bun-only-');
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

const ENTRY = [
    "import { Burger } from 'burger-api';",
    "const app = new Burger({ apiDir: './src/api' });",
    'app.serve(4000);',
].join('\n');

async function buildPortable(dir: string): Promise<{
    success: boolean;
    logs: string[];
}> {
    const logs: string[] = [];
    const logSpy = spyOn(console, 'log').mockImplementation(
        (...args: unknown[]) => {
            logs.push(args.map(String).join(' '));
        }
    );
    // Entry-options extraction may warn about dropped lines; keep output clean.
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const result = await runVirtualEntryBuild({
            cwd: dir,
            entryFile: 'src/index.ts',
            outfile: '.build/cloudflare/index.ts',
            platformTarget: 'cloudflare',
        });
        return { success: result.success, logs };
    } finally {
        logSpy.mockRestore();
        warnSpy.mockRestore();
    }
}

describe('portable-target Bun-only warning', () => {
    it('warns once, lists the flagged files, and keeps building', async () => {
        const dir = project({
            'src/index.ts': ENTRY,
            'src/api/uses-bun/route.ts': [
                'export function GET() {',
                "    return new Response(Bun.file('data.txt').size);",
                '}',
            ].join('\n'),
            'src/api/imports-bun/route.ts': [
                "import { env } from 'bun';",
                'export function GET() {',
                '    return Response.json({ mode: env.NODE_ENV });',
                '}',
            ].join('\n'),
            'src/api/plain/route.ts':
                'export function GET() { return Response.json({ ok: true }); }',
            'src/hooks.ts': [
                "import { serve } from 'bun';",
                'export const onRequest = [];',
                'void serve;',
            ].join('\n'),
        });

        const { success, logs } = await buildPortable(dir);
        expect(success).toBe(true);

        const warnings = logs.filter((line) =>
            line.includes('Bun-only APIs')
        );
        expect(warnings.length).toBe(1);
        const warning = warnings[0]!;
        expect(warning).toContain('"cloudflare"');
        expect(warning).toContain('src/api/uses-bun/route.ts');
        expect(warning).toContain('src/api/imports-bun/route.ts');
        expect(warning).toContain('src/hooks.ts');
        // Clean files are not listed.
        expect(warning).not.toContain('src/api/plain/route.ts');
        expect(warning).not.toContain('src/index.ts');
    });

    // Regression: `src/db.ts` (bun:sqlite) was missed because only route and
    // convention files were scanned, not the local files they import.
    it('follows local imports to find Bun-only helpers', async () => {
        const dir = project({
            'src/index.ts': ENTRY,
            'src/providers.ts': [
                "import { openDb } from './db';",
                'export default (burger: { provide(n: string, v: unknown): void }) => {',
                "    burger.provide('db', openDb());",
                '};',
            ].join('\n'),
            'src/db.ts': [
                "import { Database } from 'bun:sqlite';",
                "export const openDb = () => new Database(':memory:');",
            ].join('\n'),
            'src/api/plain/route.ts':
                'export function GET() { return Response.json({ ok: true }); }',
            // Feature-checked Bun use (like the ecosystem logger) is portable.
            'src/hooks.ts': [
                'const now = () =>',
                "    typeof Bun !== 'undefined' ? Bun.nanoseconds() : performance.now();",
                'export const onRequest = [];',
                'void now;',
            ].join('\n'),
        });

        const { logs } = await buildPortable(dir);
        const warning = logs.find((line) => line.includes('Bun-only APIs'));
        expect(warning).toBeDefined();
        expect(warning).toContain('src/db.ts');
        expect(warning).not.toContain('src/providers.ts');
        expect(warning).not.toContain('src/hooks.ts');
    });

    it('does not warn when no user source touches Bun-only APIs', async () => {
        const dir = project({
            'src/index.ts': ENTRY,
            'src/api/plain/route.ts':
                'export function GET() { return Response.json({ ok: true }); }',
        });

        const { success, logs } = await buildPortable(dir);
        expect(success).toBe(true);
        expect(logs.some((line) => line.includes('Bun-only APIs'))).toBe(
            false
        );
    });
});
