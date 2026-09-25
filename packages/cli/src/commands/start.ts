/**
 * Start Command
 *
 * Runs the production build without hot reload.
 * Sets NODE_ENV=production for optimized behavior.
 *
 * Example: burger-api start
 * Example: burger-api start --port 8080
 * Example: burger-api start --file dist/index.js
 */

import { Command } from 'commander';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
    DEFAULT_ENTRY_FILES,
    validatePort,
} from '../utils/build/project';
import {
    error as logError,
    info,
    newline,
    highlight,
    dim,
    warning,
} from '../utils/logger';

interface StartCommandOptions {
    port?: string;
    file?: string;
}

const BUNDLE = '.build/bundle/app.js';

/**
 * Resolve the production entry file.
 * Priority: --file flag → .build/bundle/app.js → src/index.ts|js|mjs
 */
export function resolveStartEntry(fileFlag: string | undefined): string {
    if (fileFlag) return fileFlag;
    if (existsSync(BUNDLE)) return BUNDLE;
    return DEFAULT_ENTRY_FILES.find((f) => existsSync(f)) ?? 'src/index.ts';
}

/** Newest modification time (ms) of any file under `dir`, or 0. */
export function newestMtime(dir: string): number {
    let newest = 0;
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return 0;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            newest = Math.max(newest, newestMtime(full));
        } else if (entry.isFile()) {
            newest = Math.max(newest, statSync(full).mtimeMs);
        }
    }
    return newest;
}

/**
 * Create the "start" command — production server per vision §17.
 */
export const startCommand = new Command('start')
    .description('Start production server (no hot reload)')
    .option(
        '-p, --port <port>',
        'Port to run the server on (default: $PORT or 4000)'
    )
    .option(
        '-f, --file <file>',
        'Entry file (default: .build/bundle/app.js if built, else src/index.ts|js|mjs)'
    )
    .action(async (options: StartCommandOptions) => {
        const file = resolveStartEntry(options.file);
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
            info(
                file === '.build/bundle/app.js'
                    ? 'Run "burger-api build" first to create the production bundle.'
                    : 'Make sure you are in the project directory.'
            );
            process.exit(1);
        }

        newline();
        info(
            `Starting production server on ${highlight(`http://localhost:${port}`)}`
        );
        if (file === BUNDLE) {
            info(`Entry: ${file} (production build)`);
            if (newestMtime('src') > statSync(BUNDLE).mtimeMs) {
                warning(
                    'The build is older than your source files in src/ — run "bun run build" (or "burger-api build") to include recent changes.'
                );
            }
        } else {
            info(`Entry: ${file} (no build found — running from source)`);
        }
        info('Press Ctrl+C to stop');
        dim('No hot reload — production mode');
        newline();

        try {
            const proc = Bun.spawn(['bun', file], {
                stdout: 'inherit',
                stderr: 'inherit',
                stdin: 'inherit',
                env: {
                    ...process.env,
                    PORT: port,
                    NODE_ENV: 'production',
                },
            });

            process.once('SIGINT', () => {
                newline();
                info('Shutting down server...');
                proc.kill();
                process.exit(0);
            });

            process.once('SIGBREAK', () => {
                newline();
                info('Shutting down server...');
                proc.kill();
                process.exit(0);
            });

            const exitCode = await proc.exited;
            if (exitCode !== 0) {
                logError('Server stopped unexpectedly');
                process.exit(exitCode);
            }
        } catch (err) {
            logError(
                err instanceof Error ? err.message : 'Failed to start server'
            );
            process.exit(1);
        }
    });
