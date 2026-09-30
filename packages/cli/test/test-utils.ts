import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Command } from 'commander';
import type { CreateOptions } from '../src/types';

const CLI_ENTRY = join(import.meta.dir, '..', 'src', 'index.ts');

/** Default `CreateOptions` for tests, overridable per field. */
export function baseCreateOptions(
    overrides: Partial<CreateOptions> = {}
): CreateOptions {
    return {
        name: 'demo',
        useApi: true,
        apiDir: 'api',
        apiPrefix: '/api',
        debug: false,
        usePages: false,
        pageDir: 'pages',
        pagePrefix: '/',
        useWs: false,
        wsDir: 'websocket',
        addSkills: false,
        lang: 'ts',
        ...overrides,
    };
}

/** Runs `fn` with `globalThis.fetch` replaced, restoring it afterwards. */
export async function withMockedFetch<T>(
    mock: (
        input: string | URL | Request,
        init?: RequestInit
    ) => Response | Promise<Response>,
    fn: () => Promise<T>
): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
        mock(input, init)) as typeof fetch;
    try {
        return await fn();
    } finally {
        globalThis.fetch = original;
    }
}

/** Thrown by {@link runCommandInProcess} in place of a real `process.exit`. */
export class ProcessExitError extends Error {
    constructor(public readonly code: number) {
        super(`process.exit(${code})`);
        this.name = 'ProcessExitError';
    }
}

export interface InProcessResult {
    /**
     * Exit code passed to `process.exit`, or null when the action finished
     * without exiting.
     */
    exitCode: number | null;
    /** Everything the action wrote to console.log/error and stdout/stderr. */
    output: string;
}

export interface RunCommandOptions {
    /**
     * Force `process.stdin.isTTY = true` so TTY-only prompt paths run.
     * Default false: stdin is forced non-TTY.
     */
    tty?: boolean;
}

/**
 * Runs a commander command's action in-process, with cwd set to `cwd` and
 * stdin forced non-TTY (see {@link RunCommandOptions.tty}), so command flows
 * can be tested with a mocked fetch. `process.exit` is mocked: the code is
 * recorded first, then thrown as a {@link ProcessExitError}, so `exitCode` is
 * still reported when a command action catches (swallows) that error itself.
 * Only the first exit call counts — a real process terminates there, so code
 * that catches the mock's throw and exits again (e.g. an action's catch block)
 * cannot change the recorded code.
 *
 * Limits: the caller reuses the same `Command` instance, and commander keeps
 * option values between `parseAsync` calls on it. Pass every option on every
 * call, or only use this helper for commands whose flags cannot leak between
 * calls (e.g. argument-only commands).
 */
export async function runCommandInProcess(
    command: Command,
    args: string[],
    cwd: string,
    options: RunCommandOptions = {}
): Promise<InProcessResult> {
    const originalExit = process.exit;
    const originalCwd = process.cwd();
    const originalLog = console.log;
    const originalError = console.error;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    let exitCode: number | null = null;
    let output = '';

    const capture = (...parts: unknown[]): void => {
        output += parts.map((p) => String(p)).join(' ') + '\n';
    };
    const captureWrite = (chunk: unknown): boolean => {
        output += typeof chunk === 'string' ? chunk : String(chunk);
        return true;
    };

    process.exit = ((code?: number) => {
        // A real process exits on the first call; remember it so later exits
        // (unreachable in production) cannot override the reported code.
        if (exitCode === null) exitCode = code ?? 0;
        throw new ProcessExitError(code ?? 0);
    }) as never;
    console.log = capture;
    console.error = capture;
    process.stdout.write = captureWrite as never;
    process.stderr.write = captureWrite as never;
    Object.defineProperty(process.stdin, 'isTTY', {
        value: options.tty === true,
        configurable: true,
    });
    process.chdir(cwd);
    try {
        await command.parseAsync(args, { from: 'user' });
    } catch (err) {
        if (!(err instanceof ProcessExitError)) throw err;
    } finally {
        process.chdir(originalCwd);
        if (stdinTty) {
            Object.defineProperty(process.stdin, 'isTTY', stdinTty);
        } else {
            delete (process.stdin as { isTTY?: boolean }).isTTY;
        }
        console.log = originalLog;
        console.error = originalError;
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
        process.exit = originalExit;
    }
    return { exitCode, output };
}

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

/**
 * Spawn options for processes {@link killTree} must kill:
 * POSIX children get their own process group (detached), so one negative-pid
 * signal reaches the whole tree. Windows keeps the default — taskkill /T
 * walks the tree instead. Pipes still work in both cases.
 */
export function treeKillSpawnOptions(): { detached: boolean } {
    return { detached: process.platform !== 'win32' };
}

/**
 * Kills a process and its children: its process group on POSIX, a taskkill
 * /T tree on Windows.
 */
export async function killTree(proc: KillableProcess): Promise<void> {
    try {
        if (proc.pid !== undefined && process.platform !== 'win32') {
            try {
                // Negative pid = the process group created by
                // treeKillSpawnOptions()'s detached spawn.
                process.kill(-proc.pid, 'SIGTERM');
                return;
            } catch {
                // No group (spawned without detached) — kill the one process.
            }
        }
        if (process.platform === 'win32' && proc.pid !== undefined) {
            spawnSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], {
                stdio: 'ignore',
            });
            return;
        }
        proc.kill();
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
