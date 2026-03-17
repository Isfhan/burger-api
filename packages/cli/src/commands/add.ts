/**
 * Add Command
 *
 * Downloads middleware from the ecosystem and adds it to the user's project.
 * Users can add multiple middleware at once!
 *
 * Example: burger-api add cors logger rate-limiter
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import * as clack from '@clack/prompts';
import { generateMiddlewareIndex } from '../utils/templates';
import { middlewareExists, downloadMiddleware } from '../utils/github';
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
    .description('Add middleware from the ecosystem')
    .argument('<middleware...>', 'Names of middleware to add')
    .action(async (middlewareNames: string[]) => {
        clack.intro('Add middleware to your project');

        // Make sure we're in a BurgerAPI project
        if (!existsSync('package.json')) {
            clack.outro('Not in a BurgerAPI project');
            logError(
                'Please run this command from a BurgerAPI project directory.'
            );
            info('Create a new project with: burger-api create <name>');
            process.exit(1);
        }

        // Create ecosystem/middleware directory if it doesn't exist
        // Ecosystem middleware goes here, user's custom middleware can go in middleware/
        const ecosystemDir = join(process.cwd(), 'ecosystem');
        const middlewareDir = join(ecosystemDir, 'middleware');
        if (!existsSync(middlewareDir)) {
            // Create it with a proper starter file
            await Bun.write(
                join(middlewareDir, 'index.ts'),
                generateMiddlewareIndex()
            );
            info('Created ecosystem/middleware/ directory');
            newline();
        }

        // Process each middleware
        const results = {
            success: [] as string[],
            failed: [] as string[],
            skipped: [] as string[],
        };

        for (const name of middlewareNames) {
            try {
                // Check if it exists on GitHub
                let spin = spinner(`Checking ${name}...`);

                let exists;
                try {
                    exists = await middlewareExists(name);
                } catch (err) {
                    spin.stop('Could not connect to GitHub', true);
                    logError(
                        'Please check your internet connection and try again.'
                    );
                    results.failed.push(name);
                    continue;
                }

                if (!exists) {
                    spin.stop(`Middleware "${name}" not found`, true);
                    results.failed.push(name);
                    continue;
                }

                spin.update(`Downloading ${name}...`);

                // Check if it already exists locally
                const targetDir = join(middlewareDir, name);
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

                // Download the middleware
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
            success(`Successfully added ${results.success.length} middleware:`);
            results.success.forEach((name) => bullet(name));
            newline();

            // Show usage instructions
            header('How to Use');
            info('Import and use the middleware in your index.ts:');
            newline();
            code('import { Burger } from "burger-api";');
            results.success.forEach((name) => {
                code(
                    `import { ${name} } from "./ecosystem/middleware/${name}/${name}";`
                );
            });
            newline();
            code('const app = new Burger({');
            code('    apiDir: "./api",');
            code('    globalMiddleware: [');
            results.success.forEach((name) => {
                code(`        ${name}(),`);
            });
            code('    ],');
            code('});');
            newline();
            newline();

            info('Check each middleware README for configuration options:');
            results.success.forEach((name) => {
                bullet(`ecosystem/middleware/${name}/README.md`);
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
