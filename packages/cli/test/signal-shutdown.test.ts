/**
 * `dev` and `start` must stop their server child when the CLI itself is
 * asked to terminate. Windows cannot deliver SIGTERM/SIGHUP to a process,
 * so the whole file is skipped there.
 *
 * The fixtures deliberately skip burger-api: a plain `Bun.serve` script keeps
 * the test about child-signal forwarding, not framework startup.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import {
    getAvailablePort,
    killTree,
    makeTempDir,
    removeDir,
    treeKillSpawnOptions,
    waitForServer,
} from './test-utils';

const CLI_ENTRY = resolve(import.meta.dir, '..', 'src', 'index.ts');

/** Cold `bun` boots take a moment; fail long before the suite timeout. */
const BOOT_TIMEOUT_MS = 20_000;

/** How long the CLI may take to exit after the signal. */
const EXIT_TIMEOUT_MS = 10_000;

/** How long the port may stay bound after the CLI exited. */
const PORT_FREE_TIMEOUT_MS = 5_000;

/** SIGKILL escalation delay used by the "ignores SIGTERM" test. */
const KILL_TIMEOUT_MS = 500;

const SERVER_SOURCE = [
    'Bun.serve({',
    '    port: Number(process.env.PORT),',
    "    fetch: () => new Response('ok'),",
    '});',
].join('\n');

const IGNORES_SIGTERM_SOURCE = [
    "process.on('SIGTERM', () => {});",
    '',
    SERVER_SOURCE,
].join('\n');

type Mode = 'start-file' | 'start-bundle' | 'dev';

type ShutdownSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';

/** Exit code a shell reports for a process stopped by `signal`. */
const EXIT_CODES: Record<ShutdownSignal, number> = {
    SIGHUP: 129,
    SIGINT: 130,
    SIGTERM: 143,
};

const createdDirs: string[] = [];

afterEach(() => {
    for (const dir of createdDirs.splice(0)) removeDir(dir);
});

function makeProject(source: string): string {
    const dir = makeTempDir('burger-signals-');
    createdDirs.push(dir);
    writeFileSync(join(dir, 'fixture.ts'), source);
    return dir;
}

/** Writes the entry the mode uses and returns the CLI argv for it. */
function cliArgs(
    mode: Mode,
    dir: string,
    port: number,
    source: string
): string[] {
    if (mode === 'start-bundle') {
        const bundle = join(dir, '.build', 'bundle', 'app.js');
        mkdirSync(dirname(bundle), { recursive: true });
        writeFileSync(bundle, source);
        return ['start', '--port', String(port)];
    }
    return [
        mode === 'dev' ? 'dev' : 'start',
        '--file',
        join(dir, 'fixture.ts'),
        '--port',
        String(port),
    ];
}

function collectStream(
    stream: ReadableStream<Uint8Array>,
    sink: (text: string) => void
): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    return (async () => {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            sink(decoder.decode(value, { stream: true }));
        }
    })();
}

async function waitForExit(
    child: { exited: Promise<number> },
    timeoutMs: number
): Promise<number> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolveTimeout) => {
        timer = setTimeout(() => resolveTimeout('timeout'), timeoutMs);
    });
    const outcome = await Promise.race([child.exited, timeout]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
        throw new Error(`CLI did not exit within ${timeoutMs}ms`);
    }
    return outcome;
}

/** Polls until the dead server stops answering. */
async function waitForNoResponse(
    url: string,
    timeoutMs: number
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await fetch(url);
        } catch {
            return;
        }
        await Bun.sleep(100);
    }
    throw new Error(`server still answers at ${url}`);
}

/** Polls until a new server can bind the port (no orphan holds it). */
async function waitForPortFree(
    port: number,
    timeoutMs: number
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            const probe = Bun.serve({
                port,
                fetch: () => new Response(null),
            });
            probe.stop(true);
            return;
        } catch (err) {
            lastError = err;
            await Bun.sleep(100);
        }
    }
    throw new Error(`port ${port} is still in use: ${String(lastError)}`);
}

/**
 * Boots the CLI for one mode, sends `signal` to the CLI process only (never
 * the group), and verifies the child is gone. Returns the time from signal
 * to CLI exit.
 */
async function runShutdownScenario(
    mode: Mode,
    signal: ShutdownSignal,
    source: string = SERVER_SOURCE,
    env: Record<string, string> = {}
): Promise<number> {
    const dir = makeProject(source);
    const port = await getAvailablePort();
    const url = `http://127.0.0.1:${port}`;

    const proc = Bun.spawn(['bun', CLI_ENTRY, ...cliArgs(mode, dir, port, source)], {
        cwd: dir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, ...env },
        ...treeKillSpawnOptions(),
    });

    let stdout = '';
    let stderr = '';
    const pumps = Promise.all([
        collectStream(proc.stdout as ReadableStream<Uint8Array>, (text) => {
            stdout += text;
        }),
        collectStream(proc.stderr as ReadableStream<Uint8Array>, (text) => {
            stderr += text;
        }),
    ]);

    try {
        const res = await waitForServer(url, BOOT_TIMEOUT_MS);
        expect(await res.text()).toBe('ok');
        expect(proc.exitCode).toBeNull();

        const pid = proc.pid;
        if (pid === undefined) throw new Error('CLI has no pid');
        const signalledAt = Date.now();
        // Only the CLI: a terminal would reach the group, supervisors don't.
        process.kill(pid, signal);

        const exitCode = await waitForExit(proc, EXIT_TIMEOUT_MS);
        const elapsed = Date.now() - signalledAt;
        expect(exitCode).toBe(EXIT_CODES[signal]);
        expect(stdout).toContain('Shutting down server...');
        await waitForNoResponse(url, PORT_FREE_TIMEOUT_MS);
        await waitForPortFree(port, PORT_FREE_TIMEOUT_MS);
        await pumps;
        return elapsed;
    } catch (err) {
        await killTree(proc);
        await pumps;
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            `${mode} ${signal} failed: ${message}\n` +
                `--- CLI stdout ---\n${stdout}\n--- CLI stderr ---\n${stderr}`
        );
    }
}

describe.skipIf(process.platform === 'win32')(
    'dev/start child shutdown on signals',
    () => {
        const modes: Mode[] = ['start-file', 'start-bundle', 'dev'];
        const signals: ShutdownSignal[] = ['SIGTERM', 'SIGHUP', 'SIGINT'];

        for (const mode of modes) {
            for (const signal of signals) {
                it(
                    `${mode} stops its child on ${signal}`,
                    async () => {
                        await runShutdownScenario(mode, signal);
                    },
                    45_000
                );
            }
        }

        it(
            'SIGKILLs a child that ignores SIGTERM after the timeout',
            async () => {
                const elapsed = await runShutdownScenario(
                    'start-file',
                    'SIGTERM',
                    IGNORES_SIGTERM_SOURCE,
                    { BURGER_API_SHUTDOWN_TIMEOUT_MS: String(KILL_TIMEOUT_MS) }
                );
                // The child had to survive the graceful window before dying.
                expect(elapsed).toBeGreaterThanOrEqual(KILL_TIMEOUT_MS - 100);
            },
            45_000
        );
    }
);
