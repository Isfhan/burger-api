import { spawn } from 'child_process';
import { once } from 'events';
import { createServer } from 'net';

export interface RunningExampleServer {
    process: ReturnType<typeof spawn>;
    port: number;
    baseUrl: string;
}

async function getAvailablePort(): Promise<number> {
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

async function waitForHealth(options: {
    baseUrl: string;
    healthPath: string;
    acceptedStatuses: number[];
    timeoutMs?: number;
    healthHeaders?: Record<string, string>;
}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 15000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`${options.baseUrl}${options.healthPath}`, {
                headers: options.healthHeaders,
            });
            if (options.acceptedStatuses.includes(res.status)) {
                return;
            }
        } catch {
            // Keep polling until timeout.
        }
        await Bun.sleep(150);
    }

    throw new Error(
        `Server did not become healthy at ${options.baseUrl}${options.healthPath} within ${timeoutMs}ms.`
    );
}

export async function startExampleServer(options: {
    exampleDir: string;
    healthPath: string;
    port?: number;
    acceptedStatuses?: number[];
    timeoutMs?: number;
    /** Entry file relative to the example dir (default `src/index.ts`). */
    entry?: string;
    /** Extra environment variables for the child process (merged over `process.env`). */
    env?: Record<string, string | undefined>;
    /** Extra headers for the health-check probe (e.g. proxy headers). */
    healthHeaders?: Record<string, string>;
}): Promise<RunningExampleServer> {
    const port = options.port ?? (await getAvailablePort());
    const baseUrl = `http://localhost:${port}`;
    const acceptedStatuses = options.acceptedStatuses ?? [200];
    const entry = options.entry ?? 'src/index.ts';

    const proc = spawn('bun', ['run', entry], {
        cwd: options.exampleDir,
        env: { ...process.env, ...options.env, PORT: String(port) },
        stdio: 'pipe',
    });

    const earlyExit = once(proc, 'exit').then(([code]) => {
        throw new Error(
            `Example server exited before health check (code: ${String(code)}).`
        );
    });

    await Promise.race([
        waitForHealth({
            baseUrl,
            healthPath: options.healthPath,
            acceptedStatuses,
            timeoutMs: options.timeoutMs,
            healthHeaders: options.healthHeaders,
        }),
        earlyExit,
    ]);

    // Health check won; when stopExampleServer kills the process, earlyExit will
    // eventually reject. Attach a no-op handler so that rejection is not unhandled.
    earlyExit.catch(() => {});

    return { process: proc, port, baseUrl };
}

export async function stopExampleServer(
    server: RunningExampleServer | null
): Promise<void> {
    if (!server) return;
    if (server.process.killed) return;

    server.process.kill('SIGTERM');
    const exited = once(server.process, 'exit');
    const timeout = Bun.sleep(3000).then(() => {
        try {
            server.process.kill('SIGKILL');
        } catch {
            // Process may have exited between timeout and SIGKILL; ignore.
        }
    });
    await Promise.race([exited, timeout]);
}
