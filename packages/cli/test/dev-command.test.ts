/**
 * `burger-api dev` focused test: boots a temp project (local burger-api
 * linked, no network), serves a route, and hot-reloads an edited route.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import {
    getAvailablePort,
    killTree,
    makeTempDir,
    removeDir,
    waitForServer,
} from './test-utils';

const BURGER_API_PKG = resolve(import.meta.dir, '..', '..', 'burger-api');
const CLI_ENTRY = resolve(import.meta.dir, '..', 'src', 'index.ts');
const DEV_TIMEOUT = 60_000;

let createdDir: string | null = null;

afterAll(() => {
    if (createdDir) removeDir(createdDir);
});

/** Temp project with the local burger-api package linked into node_modules. */
function makeProject(): string {
    const dir = makeTempDir('burger-dev-');
    createdDir = dir;
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    symlinkSync(
        BURGER_API_PKG,
        join(dir, 'node_modules', 'burger-api'),
        process.platform === 'win32' ? 'junction' : 'dir'
    );
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'dev-test', version: '0.0.0' })
    );
    mkdirSync(join(dir, 'src', 'api', 'hello'), { recursive: true });
    writeFileSync(
        join(dir, 'src', 'index.ts'),
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
        join(dir, 'src', 'api', 'hello', 'route.ts'),
        "export const GET = () => Response.json({ version: 'v1' });\n"
    );
    return dir;
}

describe('dev command', () => {
    it(
        'boots the project and restarts when a route file changes',
        async () => {
            const dir = makeProject();
            const port = await getAvailablePort();
            const baseUrl = `http://127.0.0.1:${port}`;

            const proc = Bun.spawn(
                ['bun', CLI_ENTRY, 'dev', '--port', String(port)],
                {
                    cwd: dir,
                    stdout: 'pipe',
                    stderr: 'pipe',
                }
            );
            const outReader = new Response(proc.stdout).text();
            const errReader = new Response(proc.stderr).text();

            try {
                const first = await waitForServer(
                    `${baseUrl}/api/hello`,
                    30_000
                );
                expect(first.status).toBe(200);
                expect(await first.json()).toEqual({ version: 'v1' });

                // Edit a route; dev watches src/ and restarts the child.
                writeFileSync(
                    join(dir, 'src', 'api', 'hello', 'route.ts'),
                    'export const GET = () =>\n' +
                        "    Response.json({ version: 'v2' });\n"
                );

                const deadline = Date.now() + 20_000;
                let body: unknown = null;
                while (Date.now() < deadline) {
                    try {
                        const res = await fetch(`${baseUrl}/api/hello`);
                        const candidate = await res.json();
                        if (
                            (candidate as { version?: string }).version ===
                            'v2'
                        ) {
                            body = candidate;
                            break;
                        }
                    } catch {
                        // Restart in progress.
                    }
                    await Bun.sleep(200);
                }
                expect(body).toEqual({ version: 'v2' });
            } finally {
                await killTree(proc);
            }

            const [stdout, stderr] = await Promise.all([outReader, errReader]);
            expect(stdout + stderr).toContain(
                'Restarting (file change detected)'
            );
        },
        DEV_TIMEOUT
    );
});
