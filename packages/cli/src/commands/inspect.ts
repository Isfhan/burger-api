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
import {
    ensureAppDirEnv,
    scanApiRoutes,
    scanPageRoutes,
    scanWebSocketRoutes,
} from '../utils/scanner';
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

/**
 * Structured, machine-readable inspection result — the same data the
 * formatted console output presents, serialized instead of printed. Kept
 * as a single named interface (not an inline object literal at the print
 * site) so it's a documented, versionable contract: a CLI meant to be
 * consumed by AI agents/tooling needs its structured output to be a real
 * type, not an implicit shape that can drift silently.
 */
export interface InspectResult {
    /** Schema version for this JSON shape — bump on any breaking field change. */
    version: 1;
    config: {
        apiDir: string;
        pageDir: string;
        apiPrefix: string;
        pagePrefix: string;
        wsDir: string;
        debug: boolean;
    };
    apiRoutes: {
        routePath: string;
        importPath: string;
        methods: string[];
        hasHooks: boolean;
        hasSchema: boolean;
        hasOpenapi: boolean;
        hasConfig: boolean;
    }[];
    pageRoutes: { routePath: string; importPath: string }[];
    wsRoutes: {
        routePath: string;
        importPath: string;
        hasHooks: boolean;
        hasConfig: boolean;
    }[];
    hooks: {
        global: string[];
        routes: { routePath: string; importPath: string }[];
    };
    plugins: { pluginsFileFound: boolean };
    conventionFiles: {
        totalApiRoutes: number;
        schema: number;
        openapi: number;
        config: number;
        hooks: number;
    };
}

async function buildInspectResult(cwd: string): Promise<InspectResult> {
    ensureAppDirEnv();
    const config = await resolveBuildConfig(cwd);

    const apiEntries = await scanApiRoutes(
        cwd,
        config.apiDir,
        config.apiPrefix
    );
    const pageEntries = await scanPageRoutes(
        cwd,
        config.pageDir,
        config.pagePrefix
    );
    const wsEntries = config.wsDir
        ? await scanWebSocketRoutes(cwd, config.wsDir)
        : [];
    const globalHooks = await detectGlobalHooks(cwd);
    const routesWithHooks = apiEntries.filter((e) => e.hooksPath);

    return {
        version: 1,
        config: {
            apiDir: config.apiDir,
            pageDir: config.pageDir,
            apiPrefix: config.apiPrefix,
            pagePrefix: config.pagePrefix,
            wsDir: config.wsDir ?? '',
            debug: config.debug ?? false,
        },
        apiRoutes: apiEntries.map((e) => ({
            routePath: e.routePath,
            importPath: e.importPath,
            methods: e.methods ?? [
                'GET',
                'POST',
                'PUT',
                'DELETE',
                'PATCH',
                'HEAD',
            ],
            hasHooks: !!e.hooksPath,
            hasSchema: !!e.schemaPath,
            hasOpenapi: !!e.openapiPath,
            hasConfig: !!e.configPath,
        })),
        pageRoutes: pageEntries.map((e) => ({
            routePath: e.routePath,
            importPath: e.importPath,
        })),
        wsRoutes: wsEntries.map((e) => ({
            routePath: e.routePath,
            importPath: e.importPath,
            hasHooks: !!e.hooksPath,
            hasConfig: !!e.configPath,
        })),
        hooks: {
            global: globalHooks,
            routes: routesWithHooks.map((e) => ({
                routePath: e.routePath,
                importPath: e.hooksPath!,
            })),
        },
        plugins: { pluginsFileFound: hasPluginsFile(cwd) },
        conventionFiles: {
            totalApiRoutes: apiEntries.length,
            schema: countConventionFiles(apiEntries, 'schema.ts'),
            openapi: countConventionFiles(apiEntries, 'openapi.ts'),
            config: countConventionFiles(apiEntries, 'config.ts'),
            hooks: countConventionFiles(apiEntries, 'hooks.ts'),
        },
    };
}

export const inspectCommand = new Command('inspect')
    .description('Display discovered routes, hooks, and config')
    .option(
        '--json',
        'Output a structured JSON result instead of formatted text (for tooling/agents)'
    )
    .action(async (options: { json?: boolean }) => {
        if (!existsSync('package.json')) {
            if (options.json) {
                console.log(
                    JSON.stringify({
                        error: 'Not in a BurgerAPI project directory.',
                    })
                );
            } else {
                info('Not in a BurgerAPI project directory.');
            }
            process.exit(1);
        }

        const cwd = process.cwd();
        const result = await buildInspectResult(cwd);

        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        const { config, apiRoutes: apiEntries, pageRoutes: pageEntries, wsRoutes: wsEntries } =
            result;

        // Config summary
        newline();
        header('Config');
        bullet(`apiDir: ${config.apiDir}`);
        bullet(`pageDir: ${config.pageDir}`);
        bullet(`apiPrefix: ${config.apiPrefix}`);
        bullet(`pagePrefix: ${config.pagePrefix}`);
        bullet(`wsDir: ${config.wsDir}`);
        bullet(`debug: ${config.debug}`);

        const relTo = (p: string) =>
            p.replace(cwd.replace(/\\/g, '/'), '.').replace(/\\/g, '/');

        // API Routes
        newline();
        header(`API Routes (${apiEntries.length})`);
        if (apiEntries.length === 0) {
            info(' No API routes found.');
        } else {
            for (const entry of apiEntries) {
                const methodStr = entry.methods.join(', ');
                bullet(
                    `${highlight(methodStr.padEnd(30))} ${entry.routePath} ${dimText(relTo(entry.importPath))}`
                );
            }
        }

        // Page Routes
        newline();
        header(`Page Routes (${pageEntries.length})`);
        if (pageEntries.length === 0) {
            info(' No page routes found.');
        } else {
            for (const entry of pageEntries) {
                bullet(
                    `${highlight('GET'.padEnd(30))} ${entry.routePath} ${dimText(relTo(entry.importPath))}`
                );
            }
        }

        // WebSocket Routes
        newline();
        header(`WebSocket Routes (${wsEntries.length})`);
        if (wsEntries.length === 0) {
            info(' No WebSocket routes found.');
        } else {
            for (const entry of wsEntries) {
                const features: string[] = [];
                if (entry.hasHooks) features.push('hooks');
                if (entry.hasConfig) features.push('config');
                const featureStr =
                    features.length > 0 ? ` [${features.join(', ')}]` : '';
                bullet(
                    `${highlight('WS'.padEnd(30))} ${entry.routePath} ${dimText(relTo(entry.importPath) + featureStr)}`
                );
            }
        }

        // Global hooks
        newline();
        header('Hooks');
        if (result.hooks.global.length > 0) {
            bullet(`Global: src/hooks.ts ( ${result.hooks.global.join(', ')} )`);
        } else {
            info(' Global: src/hooks.ts not found or no hooks exported.');
        }

        // Route hooks
        for (const entry of result.hooks.routes) {
            bullet(`Route: ${entry.routePath} ${dimText(relTo(entry.importPath))}`);
        }

        // Plugins
        newline();
        header('Plugins');
        if (result.plugins.pluginsFileFound) {
            bullet('src/plugins.ts found');
        } else {
            info(' No src/plugins.ts found.');
        }

        // Convention file stats
        newline();
        header('Convention Files');
        const { totalApiRoutes, schema, openapi, config: withConfig, hooks: withHooks } =
            result.conventionFiles;
        if (totalApiRoutes > 0) {
            bullet(`schema.ts: ${schema}/${totalApiRoutes} routes`);
            bullet(`openapi.ts: ${openapi}/${totalApiRoutes} routes`);
            bullet(`config.ts: ${withConfig}/${totalApiRoutes} routes`);
            bullet(`hooks.ts: ${withHooks}/${totalApiRoutes} routes`);
        }

        newline();
        success('Inspection complete.');
        newline();
    });
