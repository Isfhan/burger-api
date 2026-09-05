/**
 * Regression test: `burger-api build:exec` compiles a standalone binary
 * that must actually boot and serve requests on its own, with no Bun
 * install or node_modules alongside it at runtime.
 *
 * Found via manual testing: `core/server.ts` resolves the Bun adapter via
 * a deliberately non-static specifier
 * (`['burger-api','adapter','bun'].join('/')`) so bundlers never pull
 * `import 'bun'` into WinterCG (Cloudflare/Vercel/Deno) bundles — safe for
 * `dev`/`build`, where a real `node_modules` still exists alongside the
 * output at runtime. `build:exec` output has none: Bun's compiler can only
 * embed a dynamic import whose specifier is a literal string at the call
 * site, so the computed specifier was left unresolved and every compiled
 * binary crashed on startup with "Cannot find module
 * 'burger-api/adapter/bun'" — 100% reproducible, never caught by the
 * `bun run build` (non-exec) tests because that path never hits this code.
 *
 * Fixed in `virtual-entry.ts`: when compiling, the generated entry
 * statically imports `BunAdapter` and injects it via the framework's
 * existing `ServerOptions.adapter` seam, bypassing the dynamic import
 * entirely for this one build target.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createProject } from '../../src/utils/templates';
import type { CreateOptions } from '../../src/types';
import { getAvailablePort } from '../test-utils';

// Same rationale as scaffold-e2e.test.ts: `file:`, not `link:`, to avoid
// the packages/burger-api/examples/* symlink cycle.
const LOCAL_BURGER_API_PATH = resolve(import.meta.dir, '../../../burger-api');

const E2E_TIMEOUT = 240_000;

async function run(cmd: string[], cwd: string): Promise<{ code: number; err: string }> {
    const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
    const [code, err] = await Promise.all([
        proc.exited,
        new Response(proc.stderr).text(),
    ]);
    return { code, err };
}

async function killTree(pid: number): Promise<void> {
    try {
        if (process.platform === 'win32') {
            await run(['taskkill', '/F', '/T', '/PID', String(pid)], '.');
        } else {
            process.kill(pid, 'SIGKILL');
        }
    } catch {
        // already dead
    }
}

const createdDirs: string[] = [];
afterAll(async () => {
    for (const dir of createdDirs) {
        // Windows briefly holds the just-run .exe's file handle open even
        // after `taskkill` returns (the process record isn't reaped
        // instantly) — retry the removal instead of failing the whole
        // suite on a transient EPERM.
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await rm(dir, { recursive: true, force: true });
                break;
            } catch {
                await Bun.sleep(300);
            }
        }
    }
});

describe('E2E build:exec', () => {
    it(
        'the compiled executable boots standalone and serves GET /api',
        async () => {
            const dir = await mkdtemp(join(tmpdir(), 'burger-e2e-exec-'));
            createdDirs.push(dir);

            const options: CreateOptions = {
                name: 'e2e-exec',
                useApi: true,
                apiDir: 'api',
                apiPrefix: '/api',
                debug: false,
                usePages: false,
                addSkills: false,
                lang: 'ts',
            };
            await createProject(dir, options);

            const pkgPath = join(dir, 'package.json');
            const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
            pkg.dependencies['burger-api'] = `file:${LOCAL_BURGER_API_PATH}`;
            await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

            const install = await run(['bun', 'install'], dir);
            expect(install.code).toBe(0);

            const isWindows = process.platform === 'win32';
            const outfile = isWindows
                ? '.build/executable/app.exe'
                : '.build/executable/app';
            const build = await run(
                [
                    'bun',
                    resolve(import.meta.dir, '../../src/index.ts'),
                    'build:exec',
                    'src/index.ts',
                    '--outfile',
                    outfile,
                ],
                dir
            );
            expect(build.code).toBe(0);
            const exePath = join(dir, outfile);
            expect(existsSync(exePath)).toBe(true);
            if (!isWindows) {
                await run(['chmod', '+x', exePath], dir);
            }

            const port = await getAvailablePort();
            const proc = Bun.spawn([exePath], {
                cwd: dir,
                env: { ...process.env, PORT: String(port) },
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const outReader = new Response(proc.stdout).text();
            const errReader = new Response(proc.stderr).text();

            const deadline = Date.now() + 30_000;
            let status = -1;
            while (Date.now() < deadline) {
                try {
                    const res = await fetch(`http://localhost:${port}/api`);
                    status = res.status;
                    break;
                } catch {
                    await Bun.sleep(300);
                }
            }
            await killTree(proc.pid);
            const [stderr] = await Promise.all([errReader, outReader]);

            // The original bug's exact symptom: a "Cannot find module" crash
            // in stderr and status staying -1 (the process never served
            // anything, not even a 404).
            expect(stderr).not.toContain('Cannot find module');
            expect(status).toBe(200);
        },
        E2E_TIMEOUT
    );
});
