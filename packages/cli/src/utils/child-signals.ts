/**
 * Forward termination signals to the server child.
 *
 * The CLI runs the app in a `bun <entry>` child. A terminal sends Ctrl+C to
 * the whole process group, but SIGTERM/SIGHUP from a supervisor reach only
 * the CLI — the child would be orphaned and keep holding the port. So stop
 * the child explicitly, giving it a moment before SIGKILL.
 */

/** How long the child gets to exit after the forwarded signal. */
const DEFAULT_TIMEOUT_MS = 5000;

/** Lets tests shorten the SIGKILL escalation. */
const TIMEOUT_ENV = 'BURGER_API_SHUTDOWN_TIMEOUT_MS';

type ShutdownSignal = 'SIGHUP' | 'SIGINT' | 'SIGTERM' | 'SIGBREAK';

/** Shell-style exit codes for a process stopped by a signal. */
const EXIT_CODES: Record<ShutdownSignal, number> = {
    SIGHUP: 129,
    SIGINT: 130,
    SIGTERM: 143,
    SIGBREAK: 130,
};

/** The slice of `Bun.Subprocess` this helper needs. */
export interface SignalableChild {
    kill(signal?: string | number): void;
    exited: Promise<number>;
}

export interface ChildSignalOptions {
    /** Read lazily: `dev` replaces its child on every restart. */
    getChild: () => SignalableChild | undefined;
    /** Command cleanup (flags, watchers, timers); runs once, before the kill. */
    onSignal?: () => void;
    /** Milliseconds to wait for the child; defaults to `$TIMEOUT_ENV`. */
    timeoutMs?: number;
}

function resolveTimeout(timeoutMs: number | undefined): number {
    if (timeoutMs !== undefined) return timeoutMs;
    const fromEnv = Number(process.env[TIMEOUT_ENV]);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS;
}

function signalChild(child: SignalableChild, signal: string): void {
    try {
        child.kill(signal);
    } catch {
        // Already exited; nothing left to signal.
    }
}

/** Resolves true when the child exits within `timeoutMs`. */
function exitsWithin(
    child: SignalableChild,
    timeoutMs: number
): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        void child.exited.then(() => {
            clearTimeout(timer);
            resolve(true);
        });
    });
}

/**
 * Installs signal handlers that stop the child, then exit `128 + signal`.
 * A second signal during shutdown escalates to SIGKILL immediately.
 */
export function installChildSignalHandlers(options: ChildSignalOptions): void {
    let stopping = false;

    const shutdown = async (signal: ShutdownSignal): Promise<void> => {
        const child = options.getChild();
        if (child) {
            signalChild(child, signal);
            if (
                !(await exitsWithin(child, resolveTimeout(options.timeoutMs)))
            ) {
                signalChild(child, 'SIGKILL');
                await child.exited;
            }
        }
        process.exit(EXIT_CODES[signal]);
    };

    const signals: ShutdownSignal[] =
        process.platform === 'win32'
            ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']
            : ['SIGINT', 'SIGTERM', 'SIGHUP'];

    for (const signal of signals) {
        process.on(signal, () => {
            if (stopping) {
                // Second signal: stop waiting for a graceful exit.
                const child = options.getChild();
                if (child) signalChild(child, 'SIGKILL');
                return;
            }
            stopping = true;
            options.onSignal?.();
            void shutdown(signal);
        });
    }
}
