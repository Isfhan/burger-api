/**
 * `burger-api dev` must watch the project's `ecosystem/` directory and its
 * `burger.build.*` file, not just the entry's directory: editing a plugin in
 * `ecosystem/` has to restart the server so the new code is served.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import {
    getAvailablePort,
    killTree,
    makeTempDir,
    removeDir,
    treeKillSpawnOptions,
    waitForServer,
} from './test-utils';

const BURGER_API_PKG = resolve(import.meta.dir, '..', '..', 'burger-api');
const CLI_ENTRY = resolve(import.meta.dir, '..', 'src', 'index.ts');
const DEV_TIMEOUT = 60_000;

let createdDir: string | null = null;

afterAll(() => {
    if (createdDir) removeDir(createdDir);
});

/** Temp project whose route imports an ecosystem plugin. */
function makeProject(): string {
    const dir = makeTempDir('burger-dev-ecosystem-');
    createdDir = dir;
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    symlinkSync(
        BURGER_API_PKG,
        join(dir, 'node_modules', 'burger-api'),
        process.platform === 'win32' ? 'junction' : 'dir'
    );
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'dev-ecosystem-test', version: '0.0.0' })
    );
    writeFileSync(join(dir, 'burger.build.ts'), 'export default {};\n');

    mkdirSync(join(dir, 'ecosystem', 'plugins', 'greeting'), {
        recursive: true,
    });
    writeFileSync(
        join(dir, 'ecosystem', 'plugins', 'greeting', 'greeting.ts'),
        "export const version = 'v1';\n"
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
        [
            "import { version } from '../../../ecosystem/plugins/greeting/greeting.ts';",
            'export const GET = () => Response.json({ version });',
        ].join('\n')
    );
    return dir;
}

const RESTART_MESSAGE = 'Restarting (file change detected)';

describe('dev command — extra watch targets', () => {
    it(
        'restarts on ecosystem/ and burger.build.* edits',
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
                    ...treeKillSpawnOptions(),
                }
            );

            // Read incrementally so restart messages are observable while the
            // dev process is still running (stdout is otherwise consumed once
            // at exit).
            let output = '';
            const decoder = new TextDecoder();
            const pumps = [proc.stdout, proc.stderr].map(async (stream) => {
                const reader = stream.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    output += decoder.decode(value, { stream: true });
                }
            });
            const restartCount = (): number =>
                output.split(RESTART_MESSAGE).length - 1;
            const waitFor = async (
                predicate: () => boolean,
                timeoutMs: number
            ): Promise<boolean> => {
                const deadline = Date.now() + timeoutMs;
                while (Date.now() < deadline) {
                    if (predicate()) return true;
                    await Bun.sleep(100);
                }
                return predicate();
            };

            try {
                const first = await waitForServer(
                    `${baseUrl}/api/hello`,
                    30_000
                );
                expect(first.status).toBe(200);
                expect(await first.json()).toEqual({ version: 'v1' });

                // Let dev's own startup restart (if the platform emits one)
                // settle, so later restart counts are attributable to edits.
                await Bun.sleep(2000);
                await waitForServer(`${baseUrl}/api/hello`);

                // Editing the plugin must restart the child, not keep serving
                // the module cached by the running process.
                const beforeEcosystem = restartCount();
                writeFileSync(
                    join(
                        dir,
                        'ecosystem',
                        'plugins',
                        'greeting',
                        'greeting.ts'
                    ),
                    "export const version = 'v2';\n"
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
                expect(restartCount()).toBeGreaterThan(beforeEcosystem);

                // burger.build.* is build-time only, so no runtime signal
                // exists — assert the watcher logs a restart instead.
                const beforeConfig = restartCount();
                writeFileSync(
                    join(dir, 'burger.build.ts'),
                    'export default { debug: true };\n'
                );
                expect(
                    await waitFor(
                        () => restartCount() > beforeConfig,
                        10_000
                    )
                ).toBe(true);
            } finally {
                await killTree(proc);
                await Promise.all(pumps);
            }
        },
        DEV_TIMEOUT
    );
});
