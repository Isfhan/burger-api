/**
 * Inspect Command
 *
 * Displays discovered routes, hooks, plugins, and config summary.
 *
 * Example: burger-api inspect
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { resolveBuildConfig } from '../utils/config';
import { scanApiRoutes, scanPageRoutes, scanWebSocketRoutes } from '../utils/scanner';
import { detectExportedHookNames } from '../utils/route-methods';
import {
    success,
    info,
    newline,
    bullet,
    header,
    highlight,
} from '../utils/logger';

const DIM = '\x1b[2m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';
function dimText(text: string): string {
    return `${GRAY}${DIM}${text}${RESET}`;
}

/**
 * Count how many route entries have a sibling convention file.
 */
function countConventionFiles(
    entries: { importPath: string }[],
    convention: string
): number {
    return entries.filter((e) => {
        const dir = e.importPath.replace(/\/route\.[^.]+$/, '');
        return existsSync(join(dir, convention));
    }).length;
}

/**
 * Detect exported hook names from src/hooks.ts (global).
 */
async function detectGlobalHooks(cwd: string): Promise<string[]> {
    const hooksFile = join(cwd, 'src', 'hooks.ts');
    if (!existsSync(hooksFile)) return [];
    const names = await detectExportedHookNames(hooksFile);
    return names ?? [];
}

/**
 * Check if src/plugins.ts exists and has content.
 */
function hasPluginsFile(cwd: string): boolean {
    return existsSync(join(cwd, 'src', 'plugins.ts'));
}

export const inspectCommand = new Command('inspect')
    .description('Display discovered routes, hooks, and config')
    .action(async () => {
        if (!existsSync('package.json')) {
            info('Not in a BurgerAPI project directory.');
            process.exit(1);
        }

        const cwd = process.cwd();
        const config = await resolveBuildConfig(cwd);

        // Config summary
        newline();
        header('Config');
        bullet(`apiDir:     ${config.apiDir}`);
        bullet(`pageDir:    ${config.pageDir}`);
        bullet(`apiPrefix:  ${config.apiPrefix}`);
        bullet(`pagePrefix: ${config.pagePrefix}`);
        bullet(`wsDir:      ${config.wsDir}`);
        bullet(`debug:      ${config.debug}`);

        // Scan routes
        const apiEntries = await scanApiRoutes(cwd, config.apiDir, config.apiPrefix);
        const pageEntries = await scanPageRoutes(cwd, config.pageDir, config.pagePrefix);
        const wsEntries = config.wsDir
            ? await scanWebSocketRoutes(cwd, config.wsDir)
            : [];

        // API Routes
        newline();
        header(`API Routes (${apiEntries.length})`);
        if (apiEntries.length === 0) {
            info('  No API routes found.');
        } else {
            for (const entry of apiEntries) {
                const methods = entry.methods ?? ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
                const methodStr = methods.join(', ');
                const relativePath = entry.importPath.replace(cwd.replace(/\\/g, '/'), '.').replace(/\\/g, '/');
                bullet(`${highlight(methodStr.padEnd(30))} ${entry.routePath}  ${dimText(relativePath)}`);
            }
        }

        // Page Routes
        newline();
        header(`Page Routes (${pageEntries.length})`);
        if (pageEntries.length === 0) {
            info('  No page routes found.');
        } else {
            for (const entry of pageEntries) {
                const relativePath = entry.importPath.replace(cwd.replace(/\\/g, '/'), '.').replace(/\\/g, '/');
                bullet(`${highlight('GET'.padEnd(30))} ${entry.routePath}  ${dimText(relativePath)}`);
            }
        }

        // WebSocket Routes
        newline();
        header(`WebSocket Routes (${wsEntries.length})`);
        if (wsEntries.length === 0) {
            info('  No WebSocket routes found.');
        } else {
            for (const entry of wsEntries) {
                const relativePath = entry.importPath.replace(cwd.replace(/\\/g, '/'), '.').replace(/\\/g, '/');
                const features: string[] = [];
                if (entry.hooksPath) features.push('hooks');
                if (entry.configPath) features.push('config');
                const featureStr = features.length > 0 ? ` [${features.join(', ')}]` : '';
                bullet(`${highlight('WS'.padEnd(30))} ${entry.routePath}  ${dimText(relativePath + featureStr)}`);
            }
        }

        // Global hooks
        newline();
        header('Hooks');
        const globalHooks = await detectGlobalHooks(cwd);
        if (globalHooks.length > 0) {
            bullet(`Global: src/hooks.ts ( ${globalHooks.join(', ')} )`);
        } else {
            info('  Global: src/hooks.ts not found or no hooks exported.');
        }

        // Route hooks
        const routesWithHooks = apiEntries.filter((e) => e.hooksPath);
        if (routesWithHooks.length > 0) {
            for (const entry of routesWithHooks) {
                const relativePath = entry.hooksPath!.replace(cwd.replace(/\\/g, '/'), '.').replace(/\\/g, '/');
                bullet(`Route:  ${entry.routePath}  ${dimText(relativePath)}`);
            }
        }

        // Plugins
        newline();
        header('Plugins');
        if (hasPluginsFile(cwd)) {
            bullet('src/plugins.ts found');
        } else {
            info('  No src/plugins.ts found.');
        }

        // Convention file stats
        newline();
        header('Convention Files');
        const total = apiEntries.length;
        if (total > 0) {
            const withSchema = countConventionFiles(apiEntries, 'schema.ts');
            const withOpenapi = countConventionFiles(apiEntries, 'openapi.ts');
            const withConfig = countConventionFiles(apiEntries, 'config.ts');
            const withHooks = countConventionFiles(apiEntries, 'hooks.ts');
            bullet(`schema.ts:   ${withSchema}/${total} routes`);
            bullet(`openapi.ts:  ${withOpenapi}/${total} routes`);
            bullet(`config.ts:   ${withConfig}/${total} routes`);
            bullet(`hooks.ts:    ${withHooks}/${total} routes`);
        }

        newline();
        success('Inspection complete.');
        newline();
    });
