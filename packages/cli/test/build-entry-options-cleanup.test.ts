/**
 * The temp `src/__burger_build_options__.ts` module must never survive a
 * failed build — not even a route scan that throws (route.ts + route.js).
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import { makeTempDir, removeDir } from './test-utils';

const createdDirs: string[] = [];

function project(files: Record<string, string>): string {
    const dir = makeTempDir('burger-cleanup-');
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

describe('entry-options temp module cleanup', () => {
    it('removes it when the route scan throws', async () => {
        const dir = project({
            'src/index.ts': ENTRY,
            // The scanner fails loud on two route files in one directory.
            'src/api/conflict/route.ts':
                'export function GET() { return new Response("ts"); }\n',
            'src/api/conflict/route.js':
                'export function GET() { return new Response("js"); }\n',
        });
        const tempPath = join(dir, 'src', '__burger_build_options__.ts');
        const optionsJsPath = join(dir, 'src', '__burger_build_options__.js');

        await expect(
            runVirtualEntryBuild({
                cwd: dir,
                entryFile: 'src/index.ts',
                outfile: '.build/cloudflare/index.ts',
                platformTarget: 'cloudflare',
            })
        ).rejects.toThrow();

        expect(existsSync(tempPath)).toBe(false);
        expect(existsSync(optionsJsPath)).toBe(false);
    });

    it('removes it when no routes are found', async () => {
        const dir = project({ 'src/index.ts': ENTRY });
        const tempPath = join(dir, 'src', '__burger_build_options__.ts');

        await expect(
            runVirtualEntryBuild({
                cwd: dir,
                entryFile: 'src/index.ts',
                outfile: '.build/cloudflare/index.ts',
                platformTarget: 'cloudflare',
            })
        ).rejects.toThrow(/No routes found/);

        expect(existsSync(tempPath)).toBe(false);
    });
});
