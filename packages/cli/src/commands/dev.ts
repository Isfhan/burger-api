/**
 * Dev Command
 *
 * Runs a development server with hot reload (auto-restart on file changes).
 * This is the primary development command per vision §17.
 *
 * Example: burger-api dev
 * Example: burger-api dev --port 4000
 */

import { Command } from 'commander';
import { existsSync, watch, type FSWatcher } from 'fs';
import { dirname, resolve } from 'path';
import { resolveEntryFile, validatePort } from '../utils/build/project';
import {
    error as logError,
    info,
    newline,
    highlight,
    dim,
} from '../utils/logger';

/**
 * Debounce window for the restart watcher. A single save typically fires
 * several raw fs events in quick succession (rename + change, sometimes for
 * both a file and its parent directory) — this coalesces a burst into one
 * restart instead of several.
 */
const RESTART_DEBOUNCE_MS = 150;

/** A child that exits this soon after (re)start failed to start at all. */
const STARTUP_FAILURE_MS = 1500;

/**
 * Resolve once `port` can be bound again (or after ~2s). On Windows a
 * killed child's listening socket lingers briefly, so respawning at once
 * hit EADDRINUSE on about half of all hot restarts.
 */
async function waitForPortFree(port: number): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            const probe = Bun.serve({
                port,
                fetch: () => new Response(null),
            });
            probe.stop(true);
            return;
        } catch {
            await new Promise((r) => setTimeout(r, 100));
        }
    }
}

/**
 * Dev command options
 */
interface DevCommandOptions {
    port?: string;
    file?: string;
}

/**
 * Create the "dev" command — primary development server per vision §17.
 */
export const devCommand = new Command('dev')
    .description('Start development server with hot reload')
    .option(
        '-p, --port <port>',
        'Port to run the server on (default: $PORT or 4000)'
    )
    .option(
        '-f, --file <file>',
        'Entry file to run (default: src/index.ts, src/index.js or src/index.mjs)'
    )
    .action(async (options: DevCommandOptions) => {
        const file = resolveEntryFile(options.file);
        const portCheck = validatePort(options.port ?? process.env.PORT ?? '4000');
        if ('error' in portCheck) {
            logError(
                options.port === undefined
                    ? `${portCheck.error} (from $PORT)`
                    : portCheck.error
            );
            process.exit(2);
        }
        const port = portCheck.port;

        if (!existsSync(file)) {
            logError(`Entry file not found: ${file}`);
            info('Make sure you are in the project directory.');
            process.exit(1);
        }

        newline();
        info(
            `Starting development server on ${highlight(`http://localhost:${port}`)}`
        );
        info(`Entry: ${file}`);
        info('Press Ctrl+C to stop');
        dim('File changes will automatically restart the server');
        newline();

        // Entry-relative path fallback for the framework scanners
        // (apiDir/pageDir/wsDir resolve under this dir when they don't
        // exist relative to the project root) — also the root this
        // command watches for restarts.
        const watchRoot = dirname(resolve(file));

        let startedAt = 0;
        const spawnServer = () => {
            startedAt = Date.now();
            return Bun.spawn(['bun', file], {
                stdout: 'inherit',
                stderr: 'inherit',
                stdin: 'inherit',
                env: {
                    ...process.env,
                    PORT: port,
                    BURGER_API_APP_DIR: watchRoot,
                },
            });
        };

        let proc: ReturnType<typeof spawnServer> | undefined;
        let restarting = false;
        let shuttingDown = false;
        let restartTimer: ReturnType<typeof setTimeout> | undefined;
        let watcher: FSWatcher | undefined;
        // Set while the app is down after a crash: the next file change
        // resolves it and the loop below respawns the server.
        let wakeAfterCrash: (() => void) | undefined;

        const requestRestart = (): void => {
            if (shuttingDown) return;
            if (restartTimer) clearTimeout(restartTimer);
            restartTimer = setTimeout(() => {
                if (shuttingDown || restarting) return;
                if (wakeAfterCrash) {
                    const wake = wakeAfterCrash;
                    wakeAfterCrash = undefined;
                    dim('Restarting (file change detected)...');
                    wake();
                    return;
                }
                restarting = true;
                dim('Restarting (file change detected)...');
                proc?.kill();
            }, RESTART_DEBOUNCE_MS);
        };

        const shutdown = (): void => {
            shuttingDown = true;
            newline();
            info('Shutting down server...');
            watcher?.close();
            proc?.kill();
            process.exit(0);
        };

        try {
            proc = spawnServer();

            // Own the restart trigger directly instead of `bun --watch`:
            // `--watch` only tracks modules already reachable from the
            // entry's import graph, so a brand-new route directory (never
            // imported until the scanner's next run) is invisible to it —
            // it silently 404s until something else forces a restart.
            // Watching the whole app directory recursively for ANY
            // filesystem event (including new files/directories) closes
            // that gap.
            watcher = watch(watchRoot, { recursive: true }, () => {
                requestRestart();
            });

            process.once('SIGINT', shutdown);
            process.once('SIGBREAK', shutdown);

            for (;;) {
                const exitCode = await proc.exited;
                if (shuttingDown) break;
                if (restarting) {
                    restarting = false;
                    await waitForPortFree(Number(port));
                    if (shuttingDown) break;
                    proc = spawnServer();
                    continue;
                }
                // Exited on its own (not from our restart) — a startup
                // error (syntax error, port in use, …) or a crash. Keep
                // watching so saving the fix brings the server back instead
                // of making the user rerun `dev`.
                if (Date.now() - startedAt < STARTUP_FAILURE_MS) {
                    logError(`Server failed to start (exit code ${exitCode}).`);
                } else {
                    logError(`Server crashed (exit code ${exitCode}).`);
                }
                dim(
                    'Waiting for file changes before restarting (fix the error and save, or press Ctrl+C)...'
                );
                await new Promise<void>((wake) => (wakeAfterCrash = wake));
                if (shuttingDown) break;
                await waitForPortFree(Number(port));
                proc = spawnServer();
            }
        } catch (err) {
            watcher?.close();
            logError(
                err instanceof Error ? err.message : 'Failed to start server'
            );
            process.exit(1);
        }
    });
