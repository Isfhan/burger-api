/**
 * Regression: `burger-api build:exec` output must boot standalone with no
 * node_modules alongside it. The entry statically imports BunAdapter and
 * injects it via ServerOptions.adapter instead of a runtime dynamic import.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createProject } from '../../src/utils/templates';
import type { CreateOptions } from '../../src/types';
import { getAvailablePort, killTree, removeDir } from '../test-utils';

// `file:` not `link:`, to avoid the packages/burger-api/examples/* symlink
// cycle (see scaffold-e2e.test.ts).
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

const createdDirs: string[] = [];
afterAll(() => {
    for (const dir of createdDirs) {
        // removeDir retries on transient Windows EPERM/EBUSY while a
        // just-run .exe is still held open.
        removeDir(dir);
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
            // The CLI runs from source; the unpublished @burger-api/cli
            // devDependency would break offline installs.
            delete pkg.devDependencies?.['@burger-api/cli'];
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
