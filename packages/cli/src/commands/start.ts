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
import { existsSync } from 'fs';
import { join } from 'path';
import {
    success,
    error as logError,
    info,
    newline,
    highlight,
    dim,
    warning,
} from '../utils/logger';

interface StartCommandOptions {
    port: string;
    file: string;
}

/**
 * Resolve the production entry file.
 * Priority: --file flag → .build/bundle/index.js → src/index.ts
 */
function resolveEntryFile(fileFlag: string): string {
    if (fileFlag !== 'src/index.ts') {
        return fileFlag;
    }

    const buildOutput = join('.build', 'bundle', 'index.js');
    if (existsSync(buildOutput)) {
        return buildOutput;
    }

    return 'src/index.ts';
}

/**
 * Create the "start" command — production server per vision §17.
 */
export const startCommand = new Command('start')
    .description('Start production server (no hot reload)')
    .option('-p, --port <port>', 'Port to run the server on', '4000')
    .option('-f, --file <file>', 'Production entry file')
    .action(async (options: StartCommandOptions) => {
        const file = resolveEntryFile(options.file);
        const port = options.port;

        if (!existsSync(file)) {
            logError(`Entry file not found: ${file}`);
            info(
                file === '.build/bundle/index.js'
                    ? 'Run "burger-api build" first to create the production bundle.'
                    : 'Make sure you are in the project directory.'
            );
            process.exit(1);
        }

        newline();
        info('Starting production server...');
        newline();
        success(`Server running on ${highlight(`http://localhost:${port}`)}`);
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
