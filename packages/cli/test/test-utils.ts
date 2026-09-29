import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

const CLI_ENTRY = join(import.meta.dir, '..', 'src', 'index.ts');

/**
 * Allocates an available port on 127.0.0.1; safe for parallel tests.
 */
export async function getAvailablePort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('Failed to allocate a test port.'));
                return;
            }
            const { port } = address;
            server.close((closeErr) => {
                if (closeErr) {
                    reject(closeErr);
                    return;
                }
                resolve(port);
            });
        });
    });
}

/** Creates a unique temp directory under the OS temp dir. */
export function makeTempDir(prefix: string): string {
    return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Removes a directory recursively, retrying briefly on Windows lock errors
 * (EBUSY/EPERM). Throws when it still cannot be removed.
 */
export function removeDir(path: string): void {
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            rmSync(path, { recursive: true, force: true });
            return;
        } catch (err) {
            const code = (err as { code?: string }).code;
            if (code !== 'EBUSY' && code !== 'EPERM') throw err;
            Bun.sleepSync(200);
        }
    }
    rmSync(path, { recursive: true, force: true });
}

export interface RunCliOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
}

export interface RunCliResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    elapsedMs: number;
}

/** Runs the real CLI entry point as a child process and captures its output. */
export async function runCli(
    args: string[],
    opts: RunCliOptions = {}
): Promise<RunCliResult> {
    const start = performance.now();
    const proc = Bun.spawn(['bun', CLI_ENTRY, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: opts.cwd,
        // A parent FORCE_COLOR would force ANSI on the piped streams; drop
        // it so the non-TTY assertions test our logic.
        env: { ...process.env, FORCE_COLOR: undefined, ...opts.env },
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    return { exitCode, stdout, stderr, elapsedMs: performance.now() - start };
}

export interface KillableProcess {
    pid?: number;
    kill(signal?: string | number): void;
}

/** Kills a process and its children (taskkill on Windows). */
export async function killTree(proc: KillableProcess): Promise<void> {
    try {
        if (process.platform === 'win32' && proc.pid !== undefined) {
            spawnSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], {
                stdio: 'ignore',
            });
        } else {
            proc.kill();
        }
    } catch {
        // already dead
    }
}

/** Polls `url` until the server responds; throws when it never comes up. */
export async function waitForServer(
    url: string,
    timeoutMs = 10_000
): Promise<Response> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            return await fetch(url);
        } catch {
            await Bun.sleep(100);
        }
    }
    throw new Error(`server did not start at ${url}`);
}
