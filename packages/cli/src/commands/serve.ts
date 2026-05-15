/**
 * Serve Command
 *
 * Runs a development server with hot reload (auto-restart on file changes).
 * This is perfect for development - just edit your code and see changes instantly!
 *
 * Example: burger-api serve
 * Example: burger-api serve --port 4000
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
} from '../utils/logger';

/**
 * Serve command options
 */
interface ServeCommandOptions {
    port: string;
    file: string;
}

/**
 * Create the "serve" command
 * Starts a development server with hot reload
 */
export const serveCommand = new Command('serve')
    .description('Start development server with hot reload')
    .option('-p, --port <port>', 'Port to run the server on', '4000')
    .option('-f, --file <file>', 'Entry file to run', 'src/index.ts')
    .action(async (options: ServeCommandOptions) => {
        const file = options.file;
        const port = options.port;

        // Check if the entry file exists
        if (!existsSync(file)) {
            logError(`Entry file not found: ${file}`);
            info('Make sure you are in the project directory.');
            process.exit(1);
        }

        // Show startup message
        newline();
        info('Starting development server...');
        newline();
        success(`Server running on ${highlight(`http://localhost:${port}`)}`);
        info('Press Ctrl+C to stop');
        dim('File changes will automatically restart the server');
        newline();

        try {
            // Run bun with --watch flag for hot reload
            // We use --watch to automatically restart when files change
            const proc = Bun.spawn(['bun', '--watch', file], {
                stdout: 'inherit', // Show output in the terminal
                stderr: 'inherit', // Show errors in the terminal
                stdin: 'inherit', // Allow user input
                env: {
                    ...process.env,
                    PORT: port, // Pass port as environment variable
                },
            });

            // Handle Ctrl+C gracefully (once — avoid stacking listeners on reload edge cases)
            process.once('SIGINT', () => {
                newline();
                info('Shutting down server...');
                proc.kill();
                process.exit(0);
            });

            // Handle Ctrl+Break on Windows
            process.once('SIGBREAK', () => {
                newline();
                info('Shutting down server...');
                proc.kill();
                process.exit(0);
            });

            // Wait for the process to exit
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
