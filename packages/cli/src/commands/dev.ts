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
import { existsSync } from 'fs';
import {
    success,
    error as logError,
    info,
    newline,
    highlight,
    dim,
    warning,
} from '../utils/logger';

/**
 * Dev command options
 */
interface DevCommandOptions {
    port: string;
    file: string;
}

/**
 * Shared implementation for dev/serve commands.
 */
async function runDevServer(options: DevCommandOptions, isAlias: boolean): Promise<void> {
    const file = options.file;
    const port = options.port;

    if (!existsSync(file)) {
        logError(`Entry file not found: ${file}`);
        info('Make sure you are in the project directory.');
        process.exit(1);
    }

    newline();
    if (isAlias) {
        warning("burger-api serve is deprecated — use 'burger-api dev' instead");
        newline();
    }
    info('Starting development server...');
    newline();
    success(`Server running on ${highlight(`http://localhost:${port}`)}`);
    info('Press Ctrl+C to stop');
    dim('File changes will automatically restart the server');
    newline();

    try {
        const proc = Bun.spawn(['bun', '--watch', file], {
            stdout: 'inherit',
            stderr: 'inherit',
            stdin: 'inherit',
            env: {
                ...process.env,
                PORT: port,
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
}

/**
 * Create the "dev" command — primary development server per vision §17.
 */
export const devCommand = new Command('dev')
    .description('Start development server with hot reload')
    .option('-p, --port <port>', 'Port to run the server on', '4000')
    .option('-f, --file <file>', 'Entry file to run', 'src/index.ts')
    .action(async (options: DevCommandOptions) => {
        await runDevServer(options, false);
    });

/**
 * Create the "serve" command — backward-compat alias for "dev".
 * Prints a deprecation notice then runs the same logic.
 */
export const serveCommand = new Command('serve')
    .description('Start development server (deprecated — use "dev" instead)')
    .option('-p, --port <port>', 'Port to run the server on', '4000')
    .option('-f, --file <file>', 'Entry file to run', 'src/index.ts')
    .action(async (options: DevCommandOptions) => {
        await runDevServer(options, true);
    });
