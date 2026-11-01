/**
 * Regression: a non-`--compile` bun build is advertised as a
 * "self-contained single file" — the copy must run with no node_modules
 * next to it. The virtual entry statically imports the Bun adapter for
 * bun-target builds (the runtime's computed dynamic import cannot be
 * embedded by Bun.build).
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import {
    getAvailablePort,
    killTree,
    makeTempDir,
    removeDir,
    runCli,
    treeKillSpawnOptions,
    waitForServer,
} from './test-utils';

const BURGER_API_PKG = resolve(import.meta.dir, '..', '..', 'burger-api');

const dirs: string[] = [];
function tempDir(prefix: string): string {
    const dir = makeTempDir(prefix);
    dirs.push(dir);
    return dir;
}

afterEach(() => {
    while (dirs.length > 0) removeDir(dirs.pop()!);
});

describe('bun bundle is self-contained', () => {
    it(
        'runs the copied bundle from an empty dir and serves the route',
        async () => {
            const project = tempDir('burger-selfcontained-');
            mkdirSync(join(project, 'node_modules'), { recursive: true });
            symlinkSync(
                BURGER_API_PKG,
                join(project, 'node_modules', 'burger-api'),
                process.platform === 'win32' ? 'junction' : 'dir'
            );
            writeFileSync(
                join(project, 'package.json'),
                JSON.stringify({
                    name: 'self-contained-test',
                    version: '0.0.0',
                })
            );
            mkdirSync(join(project, 'src', 'api', 'hello'), {
                recursive: true,
            });
            writeFileSync(
                join(project, 'src', 'index.ts'),
                [
                    "import { Burger } from 'burger-api';",
                    'const app = new Burger({',
                    "    apiDir: './src/api',",
                    "    apiPrefix: '/api',",
                    '});',
                    'app.serve(Number(process.env.PORT) || 4000);',
                ].join('\n')
            );
            writeFileSync(
                join(project, 'src', 'api', 'hello', 'route.ts'),
                'export const GET = () => Response.json({ ok: true });\n'
            );

            const build = await runCli(['build', 'src/index.ts'], {
                cwd: project,
            });
            expect(build.exitCode).toBe(0);
            expect(build.stdout).toContain('self-contained single file');

            // Only the bundle is copied — no node_modules, no package.json.
            const standalone = tempDir('burger-standalone-');
            copyFileSync(
                join(project, '.build', 'bundle', 'app.js'),
                join(standalone, 'app.js')
            );

            const port = await getAvailablePort();
            const proc = Bun.spawn(['bun', 'app.js'], {
                cwd: standalone,
                env: { ...process.env, PORT: String(port) },
                stdout: 'pipe',
                stderr: 'pipe',
                ...treeKillSpawnOptions(),
            });
            const stderrReader = new Response(proc.stderr).text();
            try {
                const res = await waitForServer(
                    `http://127.0.0.1:${port}/api/hello`,
                    15_000
                );
                expect(res.status).toBe(200);
                expect(await res.json()).toEqual({ ok: true });
            } finally {
                await killTree(proc);
            }
            const stderr = await stderrReader;
            expect(stderr).not.toContain('Cannot find module');
        },
        30000
    );
});
