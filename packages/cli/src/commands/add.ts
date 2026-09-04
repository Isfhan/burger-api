/**
 * Add Command
 *
 * Downloads hooks (and later plugins) from the ecosystem into the project.
 * Example: burger-api add cors logger rate-limiter
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as clack from '@clack/prompts';
import { generateHooksIndex } from '../utils/templates';
import { detectEcosystemType, downloadComponent } from '../utils/github';
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

/** Converts a hyphenated package name to camelCase (fallback only — see {@link resolveExportName}). */
export function hyphenToCamelCase(name: string): string {
    return name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Resolves the real exported factory name for a downloaded hook/plugin, by
 * reading its main file and taking the first `export function <name>(`.
 *
 * A hyphenated directory name doesn't reliably predict its export by simple
 * case conversion — e.g. `rate-limiter` exports `rateLimit`, `compression`
 * exports `compress`, `cache` exports `cacheControl`. By convention every
 * ecosystem package defines its primary configurable factory first, with
 * preset/convenience wrappers (e.g. `noCache`, `strictSecurity`) after it,
 * so the first match is the one users are meant to import by default. Falls
 * back to a hyphen→camelCase guess if the file can't be read or has no
 * `export function` (keeps the printed snippet at least a valid identifier).
 */
export function resolveExportName(mainFilePath: string, packageName: string): string {
    try {
        const source = readFileSync(mainFilePath, 'utf-8');
        const match = source.match(/export function ([A-Za-z_$][\w$]*)\s*\(/);
        if (match?.[1]) return match[1];
    } catch {
        // File missing or unreadable — fall through to the guess below.
    }
    return hyphenToCamelCase(packageName);
}

/**
 * Create the "add" command
 * Downloads ecosystem components (hooks/plugins) from GitHub into the project
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
            await Bun.write(join(hooksDir, 'index.ts'), generateHooksIndex());
            info('Created ecosystem/hooks/ directory');
            newline();
        }

        const results = {
            success: [] as string[],
            failed: [] as string[],
            skipped: [] as string[],
        };
        // Package name -> its real exported factory name (resolved after
        // download; see `resolveExportName`).
        const exportNames = new Map<string, string>();

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
                        err instanceof Error
                            ? err.message
                            : 'Please check your internet connection and try again.'
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
                    const filesDownloaded = await downloadComponent(
                        name,
                        targetDir,
                        ecosystemType
                    );
                    spin.stop(`Added ${name} (${filesDownloaded} files)`);
                    results.success.push(name);
                    exportNames.set(
                        name,
                        resolveExportName(join(targetDir, `${name}.ts`), name)
                    );
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
                const exportName = exportNames.get(name) ?? name;
                if (isPlugin) {
                    code(
                        `import { ${exportName} } from "./ecosystem/plugins/${name}/${name}";`
                    );
                } else {
                    code(
                        `import { ${exportName} } from "./ecosystem/hooks/${name}/${name}";`
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
                        const exportName = exportNames.get(name) ?? name;
                        code(` ${exportName}(),`);
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
                        const exportName = exportNames.get(name) ?? name;
                        code(` ${exportName}(),`);
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
            warning(`Failed to add ${results.failed.length} package(s):`);
            results.failed.forEach((name) => bullet(name));
            newline();
            info('Run "burger-api list" to see available hooks and plugins.');
            newline();
        }

        if (results.skipped.length > 0) {
            info(`Skipped ${results.skipped.length} package(s):`);
            results.skipped.forEach((name) => bullet(name));
            newline();
        }

        if (results.success.length > 0) {
            clack.outro('Packages added successfully!');
        } else {
            clack.outro('No packages were added');
            process.exit(1);
        }
    });
