/**
 * Add Command
 *
 * Downloads hooks (and later plugins) from the ecosystem into the project.
 * Example: burger-api add cors logger rate-limiter
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import * as clack from '@clack/prompts';
import { generateMiddlewareIndex } from '../utils/templates';
import {
    middlewareExists,
    pluginExists,
    detectEcosystemType,
    downloadMiddleware,
} from '../utils/github';
import {
    spinner,
    success,
    error as logError,
    info,
    newline,
    header,
    code,
    warning,
    bullet,
} from '../utils/logger';

/**
 * Create the "add" command
 * Downloads middleware from GitHub and copies to project
 */
export const addCommand = new Command('add')
    .description('Add a hook or plugin from the ecosystem')
    .argument('<names...>', 'Names of ecosystem packages to add')
    .action(async (packageNames: string[]) => {
        clack.intro('Add ecosystem packages to your project');

        // Make sure we're in a BurgerAPI project
        if (!existsSync('package.json')) {
            clack.outro('Not in a BurgerAPI project');
            logError(
                'Please run this command from a BurgerAPI project directory.'
            );
            info('Create a new project with: burger-api create <name>');
            process.exit(1);
        }

        // Hooks install under ecosystem/hooks/, plugins under ecosystem/plugins/
        const ecosystemDir = join(process.cwd(), 'ecosystem');
        const hooksDir = join(ecosystemDir, 'hooks');
        const pluginsDir = join(ecosystemDir, 'plugins');
        if (!existsSync(hooksDir)) {
            await Bun.write(
                join(hooksDir, 'index.ts'),
                generateMiddlewareIndex()
            );
            info('Created ecosystem/hooks/ directory');
            newline();
        }

        const results = {
            success: [] as string[],
            failed: [] as string[],
            skipped: [] as string[],
        };

        for (const name of packageNames) {
            try {
                // Check if it exists on GitHub as hook or plugin
                let spin = spinner(`Checking ${name}...`);

                let ecosystemType: 'hook' | 'plugin' | null;
                try {
                    ecosystemType = await detectEcosystemType(name);
                } catch (err) {
                    spin.stop('Could not connect to GitHub', true);
                    logError(
                        'Please check your internet connection and try again.'
                    );
                    results.failed.push(name);
                    continue;
                }

                if (!ecosystemType) {
                    spin.stop(`Package "${name}" not found`, true);
                    results.failed.push(name);
                    continue;
                }

                const targetDir =
                    ecosystemType === 'plugin'
                        ? join(pluginsDir, name)
                        : join(hooksDir, name);

                spin.update(`Downloading ${name} (${ecosystemType})...`);
                if (existsSync(targetDir)) {
                    spin.stop();
                    // Ask if they want to overwrite
                    const shouldOverwrite = await clack.confirm({
                        message: `${name} already exists. Overwrite?`,
                        initialValue: false,
                    });

                    if (clack.isCancel(shouldOverwrite) || !shouldOverwrite) {
                        info(`Skipped ${name}`);
                        results.skipped.push(name);
                        continue;
                    }
                    spin = spinner(`Downloading ${name}...`);
                }

                try {
                    const filesDownloaded = await downloadMiddleware(
                        name,
                        targetDir
                    );
                    spin.stop(`Added ${name} (${filesDownloaded} files)`);
                    results.success.push(name);
                } catch (err) {
                    spin.stop('Download failed', true);
                    if (
                        err instanceof Error &&
                        err.message.includes('Could not download')
                    ) {
                        logError(
                            'Please check your internet connection and try again.'
                        );
                    } else {
                        logError(
                            err instanceof Error ? err.message : 'Unknown error'
                        );
                    }
                    results.failed.push(name);
                }
            } catch (err) {
                logError(
                    `Failed to add ${name}: ${
                        err instanceof Error ? err.message : 'Unknown error'
                    }`
                );
                results.failed.push(name);
            }
        }

        // Show summary
        newline();
        if (results.success.length > 0) {
            success(`Successfully added ${results.success.length} package(s):`);
            results.success.forEach((name) => bullet(name));
            newline();

            header('How to Use');
            for (const name of results.success) {
                const isPlugin = existsSync(join(pluginsDir, name));
                if (isPlugin) {
                    const className =
                        name.charAt(0).toUpperCase() + name.slice(1);
                    code(
                        `import { ${className} } from "./ecosystem/plugins/${name}/${name}";`
                    );
                } else {
                    code(
                        `import { ${name} } from "./ecosystem/hooks/${name}/${name}";`
                    );
                }
            }
            newline();
            const hasPlugins = results.success.some((n) =>
                existsSync(join(pluginsDir, n))
            );
            if (hasPlugins) {
                code('// Register plugins in src/plugins.ts:');
                code('burger.usePlugin(');
                results.success
                    .filter((n) => existsSync(join(pluginsDir, n)))
                    .forEach((name) => {
                        const className =
                            name.charAt(0).toUpperCase() + name.slice(1);
                        code(` ${className},`);
                    });
                code(');');
                newline();
            }
            const hasHooks = results.success.some((n) =>
                existsSync(join(hooksDir, n))
            );
            if (hasHooks) {
                code('// Register hooks in src/hooks.ts:');
                code('export const onRequest = [');
                results.success
                    .filter((n) => existsSync(join(hooksDir, n)))
                    .forEach((name) => {
                        code(` ${name}(),`);
                    });
                code('];');
                newline();
            }
            info('See each package README for options:');
            results.success.forEach((name) => {
                const isPlugin = existsSync(join(pluginsDir, name));
                bullet(
                    `ecosystem/${isPlugin ? 'plugins' : 'hooks'}/${name}/README.md`
                );
            });
            newline();
        }

        if (results.failed.length > 0) {
            warning(`Failed to add ${results.failed.length} middleware:`);
            results.failed.forEach((name) => bullet(name));
            newline();
            info('Run "burger-api list" to see available middleware.');
            newline();
        }

        if (results.skipped.length > 0) {
            info(`Skipped ${results.skipped.length} middleware:`);
            results.skipped.forEach((name) => bullet(name));
            newline();
        }

        if (results.success.length > 0) {
            clack.outro('Middleware added successfully!');
        } else {
            clack.outro('No middleware were added');
            process.exit(1);
        }
    });
