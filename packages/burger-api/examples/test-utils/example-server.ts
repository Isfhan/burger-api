import { spawn } from 'child_process';
import { once } from 'events';

export interface RunningExampleServer {
    process: ReturnType<typeof spawn>;
    port: number;
    baseUrl: string;
}

async function waitForHealth(options: {
    baseUrl: string;
    healthPath: string;
    acceptedStatuses: number[];
    timeoutMs?: number;
}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 15000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`${options.baseUrl}${options.healthPath}`);
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
}): Promise<RunningExampleServer> {
    const port = options.port ?? 4000;
    const baseUrl = `http://localhost:${port}`;
    const acceptedStatuses = options.acceptedStatuses ?? [200];

    const proc = spawn('bun', ['run', 'index.ts'], {
        cwd: options.exampleDir,
        env: { ...process.env, PORT: String(port) },
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
        }),
        earlyExit,
    ]);

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
        if (!server.process.killed) {
            server.process.kill('SIGKILL');
        }
    });
    await Promise.race([exited, timeout]);
}
