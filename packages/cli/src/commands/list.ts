/**
 * List Command
 *
 * Shows users all available hooks and plugins they can add to their project.
 * Fetches the list from GitHub and displays it in a nice table format.
 *
 * Example: burger-api list
 */

import { Command } from 'commander';
import { getCachedComponentCatalog } from '../utils/github';
import {
    header,
    withSpinner,
    error as logError,
    table,
    newline,
    info,
    dim,
    command,
    warning,
} from '../utils/logger';

/**
 * Create the "list" command
 * This shows all available hooks and plugins from the ecosystem
 */
export const listCommand = new Command('list')
    .description('Show available hooks and plugins from the ecosystem')
    .alias('ls') // Allow users to type "burger-api ls" too
    .action(async () => {
        try {
            await withSpinner(
                'Fetching hooks and plugins list from GitHub...',
                async (spin) => {
                    // Names, kinds and descriptions are cached together: a
                    // warm cache makes no GitHub calls at all.
                    const { data: components, stale } =
                        await getCachedComponentCatalog();

                    // No success marker when GitHub was unreachable — the
                    // warning below explains what is shown instead.
                    spin.stop(
                        stale ? undefined : 'Found available hooks and plugins!'
                    );
                    newline();

                    if (stale) {
                        warning(
                            'GitHub is unreachable — showing a cached list, which may be out of date.'
                        );
                        newline();
                    }

                    header('Available Hooks and Plugins');

                    const tableData: string[][] = [
                        ['Name', 'Kind', 'Description'],
                        ...components.map((m) => [
                            m.name,
                            m.kind,
                            m.description.length > 60
                                ? m.description.substring(0, 57) + '...'
                                : m.description,
                        ]),
                    ];

                    table(tableData);
                    newline();

                    info('To add a hook or plugin to your project, run:');
                    command('burger-api add <name>');
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
