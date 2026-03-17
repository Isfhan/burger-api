/**
 * List Command
 *
 * Shows users all available middleware they can add to their project.
 * Fetches the list from GitHub and displays it in a nice table format.
 *
 * Example: burger-api list
 */

import { Command } from 'commander';
import { getMiddlewareList, getMiddlewareInfo } from '../utils/github';
import {
    header,
    withSpinner,
    error as logError,
    table,
    newline,
    info,
    dim,
    command,
} from '../utils/logger';

/**
 * Create the "list" command
 * This shows all available middleware from the ecosystem
 */
export const listCommand = new Command('list')
    .description('Show available middleware from the ecosystem')
    .alias('ls') // Allow users to type "burger-api ls" too
    .action(async () => {
        try {
            await withSpinner(
                'Fetching middleware list from GitHub...',
                async (spin) => {
                    const middlewareNames = await getMiddlewareList();

                    const middlewareDetails = await Promise.all(
                        middlewareNames.map((name) =>
                            getMiddlewareInfo(name).catch(() => ({
                                name,
                                description: 'No description available',
                                path: '',
                                files: [],
                            }))
                        )
                    );

                    spin.stop('Found available middleware!');
                    newline();

                    header('Available Middleware');

                    const tableData: string[][] = [
                        ['Name', 'Description'],
                        ...middlewareDetails.map((m) => [
                            m.name,
                            m.description.length > 60
                                ? m.description.substring(0, 57) + '...'
                                : m.description,
                        ]),
                    ];

                    table(tableData);
                    newline();

                    info('To add middleware to your project, run:');
                    command('burger-api add <middleware-name>');
                    newline();
                    dim('Example: burger-api add cors logger rate-limiter');
                    newline();
                }
            );
        } catch (err) {
            logError(
                err instanceof Error
                    ? err.message
                    : 'Could not connect to GitHub'
            );
            newline();
            info('Please check your internet connection and try again.');
            process.exit(1);
        }
    });
