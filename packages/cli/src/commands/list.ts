/** List command — shows ecosystem hooks and plugins in a table. */

import { Command } from 'commander';
import { getCachedComponentCatalog } from '../utils/github';
import { announceLocalMode, setLocalMode } from '../utils/local-mode';
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

/** `burger-api list` — show ecosystem hooks and plugins. */
export const listCommand = new Command('list')
    .description('Show available hooks and plugins from the ecosystem')
    .alias('ls')
    .option(
        '--local',
        'Use the local burger-api checkout (bun link) instead of npm/GitHub'
    )
    .action(async (options: { local?: boolean }) => {
        setLocalMode(options.local);
        announceLocalMode();
        try {
            await withSpinner(
                'Fetching hooks and plugins list from GitHub...',
                async (spin) => {
                    // Names, kinds and descriptions are cached together —
                    // a warm cache makes no GitHub calls.
                    const { data: components, stale } =
                        await getCachedComponentCatalog();

                    // No success marker when GitHub was unreachable — the
                    // warning below explains what is shown.
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
