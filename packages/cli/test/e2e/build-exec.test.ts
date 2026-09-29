/**
 * Regression: `burger-api build:exec` output must boot standalone with no
 * node_modules alongside it. The entry statically imports BunAdapter and
 * injects it via ServerOptions.adapter instead of a runtime dynamic import.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { getAvailablePort, killTree } from '../test-utils';
import { cleanupProjects, run, scaffoldProject } from './helpers';

const E2E_TIMEOUT = 240_000;

afterAll(cleanupProjects);

describe('E2E build:exec', () => {
    it(
        'the compiled executable boots standalone and serves GET /api',
        async () => {
            const dir = await scaffoldProject('e2e-exec');

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
                    const res = await fetch(`http://127.0.0.1:${port}/api`);
                    status = res.status;
                    break;
                } catch {
                    await Bun.sleep(300);
                }
            }
            await killTree(proc);
            const [stderr] = await Promise.all([errReader, outReader]);

            // A failed boot shows "Cannot find module" in stderr and leaves
            // status at -1.
            expect(stderr).not.toContain('Cannot find module');
            expect(status).toBe(200);
        },
        E2E_TIMEOUT
    );
});
