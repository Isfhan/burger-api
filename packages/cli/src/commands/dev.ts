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
import {
    success,
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

/**
 * Dev command options
 */
interface DevCommandOptions {
    port: string;
    file: string;
}

/**
 * Create the "dev" command — primary development server per vision §17.
 */
export const devCommand = new Command('dev')
    .description('Start development server with hot reload')
    .option('-p, --port <port>', 'Port to run the server on', '4000')
    .option('-f, --file <file>', 'Entry file to run', 'src/index.ts')
    .action(async (options: DevCommandOptions) => {
        const file = options.file;
        const port = options.port;

        if (!existsSync(file)) {
            logError(`Entry file not found: ${file}`);
            info('Make sure you are in the project directory.');
            process.exit(1);
        }

        newline();
        info('Starting development server...');
        newline();
        success(`Server running on ${highlight(`http://localhost:${port}`)}`);
        info('Press Ctrl+C to stop');
        dim('File changes will automatically restart the server');
        newline();

        // Entry-relative path fallback for the framework scanners
        // (apiDir/pageDir/wsDir resolve under this dir when they don't
        // exist relative to the project root) — also the root this
        // command watches for restarts.
        const watchRoot = dirname(resolve(file));

        const spawnServer = () =>
            Bun.spawn(['bun', file], {
                stdout: 'inherit',
                stderr: 'inherit',
                stdin: 'inherit',
                env: {
                    ...process.env,
                    PORT: port,
                    BURGER_API_APP_DIR: watchRoot,
                },
            });

        let proc: ReturnType<typeof spawnServer> | undefined;
        let restarting = false;
        let shuttingDown = false;
        let restartTimer: ReturnType<typeof setTimeout> | undefined;
        let watcher: FSWatcher | undefined;

        const requestRestart = (): void => {
            if (shuttingDown) return;
            if (restartTimer) clearTimeout(restartTimer);
            restartTimer = setTimeout(() => {
                if (shuttingDown || restarting) return;
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
                    proc = spawnServer();
                    continue;
                }
                // Exited on its own (not from our restart) — a real crash.
                logError('Server stopped unexpectedly');
                watcher.close();
                process.exit(exitCode);
            }
        } catch (err) {
            watcher?.close();
            logError(
                err instanceof Error ? err.message : 'Failed to start server'
            );
            process.exit(1);
        }
    });
