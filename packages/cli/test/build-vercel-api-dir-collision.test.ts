/**
 * `--target=vercel` writes `api/index.ts` at the project root. With
 * `apiDir: 'api'` (supported), that output folder then resolves ahead of
 * `src/api` for every later scan, so `inspect`, `build` and `dev` all report
 * `[X] No routes found`. The build must fail loud *before* writing anything.
 */
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import { makeTempDir, removeDir } from './test-utils';

const ENTRY = [
    "import { Burger } from 'burger-api';",
    "const app = new Burger({ apiDir: 'api', apiPrefix: '/api' });",
    'app.serve(4000);',
].join('\n');

const ROUTE =
    'export function GET() { return Response.json({ ok: true }); }';

const createdDirs: string[] = [];

function project(files: Record<string, string>): string {
    const dir = makeTempDir('burger-vercel-collision-');
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

async function buildVercel(
    dir: string,
    outfile = 'api/index.ts'
): Promise<{ ok: true } | { ok: false; message: string }> {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        await runVirtualEntryBuild({
            cwd: dir,
            entryFile: 'src/index.ts',
            outfile,
            platformTarget: 'vercel',
        });
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            message: err instanceof Error ? err.message : String(err),
        };
    } finally {
        logSpy.mockRestore();
        warnSpy.mockRestore();
    }
}

describe('build --target=vercel: output folder must not shadow sources', () => {
    it('fails loud and writes nothing when apiDir resolves to the vercel output folder', async () => {
        const dir = project({
            'src/index.ts': ENTRY,
            'src/api/route.ts': ROUTE,
            'burger.build.ts': "export default { apiDir: 'api' };",
        });

        const result = await buildVercel(dir);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.message).toContain("apiDir: './src/api'");
        expect(result.message).toContain('burger.build.ts');
        // The colliding folder is never created, so nothing shadows the scan.
        expect(existsSync(join(dir, 'api'))).toBe(false);
    });

    it('fails loud for pageDir and wsDir collisions too', async () => {
        for (const option of ['pageDir', 'wsDir'] as const) {
            const dir = project({
                'src/index.ts': ENTRY,
                'src/api/route.ts': ROUTE,
                'burger.build.ts': `export default { ${option}: 'api' };`,
            });

            const result = await buildVercel(dir);
            expect(result.ok).toBe(false);
            if (result.ok) continue;
            expect(result.message).toContain(`${option}: './src/`);
            expect(existsSync(join(dir, 'api'))).toBe(false);
        }
    });

    it('still writes the entry when apiDir stays under src/', async () => {
        const dir = project({
            'src/index.ts': ENTRY,
            'src/api/route.ts': ROUTE,
            'burger.build.ts': "export default { apiDir: './src/api' };",
        });

        const result = await buildVercel(dir);
        expect(result.ok).toBe(true);
        expect(existsSync(join(dir, 'api', 'index.ts'))).toBe(true);
    });

    it('allows a vercel outfile outside the project apiDir', async () => {
        const dir = project({
            'src/index.ts': ENTRY,
            'src/api/route.ts': ROUTE,
            'burger.build.ts': "export default { apiDir: 'api' };",
        });

        // The real build command sets this from the entry file (entry-relative
        // fallback), so a bare `apiDir: 'api'` resolves to `src/api`.
        const originalAppDir = process.env.BURGER_API_APP_DIR;
        process.env.BURGER_API_APP_DIR = join(dir, 'src');
        try {
            const result = await buildVercel(dir, '.build/vercel/index.ts');
            expect(result.ok).toBe(true);
        } finally {
            if (originalAppDir === undefined)
                delete process.env.BURGER_API_APP_DIR;
            else process.env.BURGER_API_APP_DIR = originalAppDir;
        }
        expect(existsSync(join(dir, '.build', 'vercel', 'index.ts'))).toBe(
            true
        );
    });
});
