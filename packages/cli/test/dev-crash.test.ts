/**
 * `burger-api dev` after a startup crash: the CLI reports the crash, stays
 * alive, and respawns the server when the entry file is fixed and saved.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, renameSync, symlinkSync, writeFileSync } from 'fs';
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
const DEV_TIMEOUT = 90_000;

const GOOD_INDEX = [
    "import { Burger } from 'burger-api';",
    'const app = new Burger({',
    "    apiDir: './src/api',",
    "    apiPrefix: '/api',",
    '});',
    'app.serve(Number(process.env.PORT) || 4000);',
].join('\n');

let createdDir: string | null = null;

afterEach(() => {
    if (createdDir) {
        removeDir(createdDir);
        createdDir = null;
    }
});

/** Polls `check` until true; throws with `label` when the deadline passes. */
async function waitForOutput(
    check: () => boolean,
    label: string,
    timeoutMs: number
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (check()) return;
        await Bun.sleep(100);
    }
    throw new Error(`timed out waiting for ${label}`);
}

/** Writes a file atomically (temp + rename) so a watcher never sees a
 * half-written file. */
function writeAtomic(path: string, content: string): void {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, path);
}

describe('dev command — crash then restart on save', () => {
    it(
        'reports the crash, keeps running, and serves after the entry is fixed',
        async () => {
            const dir = makeTempDir('burger-dev-crash-');
            createdDir = dir;
            mkdirSync(join(dir, 'node_modules'), { recursive: true });
            symlinkSync(
                BURGER_API_PKG,
                join(dir, 'node_modules', 'burger-api'),
                process.platform === 'win32' ? 'junction' : 'dir'
            );
            writeFileSync(
                join(dir, 'package.json'),
                JSON.stringify({ name: 'dev-crash-test', version: '0.0.0' })
            );
            mkdirSync(join(dir, 'src', 'api', 'hello'), { recursive: true });
            writeFileSync(
                join(dir, 'src', 'api', 'hello', 'route.ts'),
                'export const GET = () => Response.json({ ok: true });\n'
            );
            // Startup crash: the entry throws before it can serve.
            writeFileSync(
                join(dir, 'src', 'index.ts'),
                "throw new Error('boom');\n"
            );

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

            let output = '';
            const decoder = new TextDecoder();
            const pumps = (
                [proc.stdout, proc.stderr] as ReadableStream<Uint8Array>[]
            ).map(async (stream) => {
                const reader = stream.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    output += decoder.decode(value, { stream: true });
                }
            });

            try {
                await waitForOutput(
                    () => output.includes('Server failed to start'),
                    'the crash report',
                    30_000
                );
                // The CLI itself must keep watching, not exit.
                expect(proc.exitCode).toBeNull();
                expect(output).toContain(
                    'Waiting for file changes before restarting'
                );

                // Save the fix; dev must pick it up on its own.
                writeAtomic(join(dir, 'src', 'index.ts'), GOOD_INDEX);

                const res = await waitForServer(`${baseUrl}/api/hello`, 30_000);
                expect(res.status).toBe(200);
                expect(await res.json()).toEqual({ ok: true });
                expect(output).toContain('Restarting (file change detected)');
            } finally {
                await killTree(proc);
                await Promise.all(pumps);
            }
        },
        DEV_TIMEOUT
    );
});
