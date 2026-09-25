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
import { PROJECT_HINT, projectError } from '../utils/build/project';
import {
    success,
    info,
    newline,
    bullet,
    header,
    highlight,
    dimText,
    error as logError,
} from '../utils/logger';

const CONVENTION_EXTS = ['.ts', '.js', '.mjs'] as const;

/** First existing `<dir>/<stem>.ts|js|mjs`, or undefined. */
function findConvention(dir: string, stem: string): string | undefined {
    for (const ext of CONVENTION_EXTS) {
        const file = join(dir, `${stem}${ext}`);
        if (existsSync(file)) return file;
    }
    return undefined;
}

/**
 * Detect exported hook names from src/hooks.(ts|js|mjs) (global).
 * `file` is the path relative to cwd, or undefined when there is none.
 */
async function detectGlobalHooks(
    cwd: string
): Promise<{ file?: string; names: string[] }> {
    const hooksFile = findConvention(join(cwd, 'src'), 'hooks');
    if (!hooksFile) return { names: [] };
    const names = await detectExportedHookNames(hooksFile);
    return {
        file: `src/${hooksFile.slice(join(cwd, 'src').length + 1)}`,
        names: names ?? [],
    };
}

/** src/plugins.(ts|js|mjs) relative to cwd, or undefined. */
function findPluginsFile(cwd: string): string | undefined {
    const file = findConvention(join(cwd, 'src'), 'plugins');
    return file ? `src/${file.slice(join(cwd, 'src').length + 1)}` : undefined;
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
        /** Global hooks file relative to the project, when present. */
        globalFile?: string;
        global: string[];
        routes: { routePath: string; importPath: string }[];
    };
    plugins: { pluginsFileFound: boolean; pluginsFile?: string };
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
    const pluginsFile = findPluginsFile(cwd);
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
            globalFile: globalHooks.file,
            global: globalHooks.names,
            routes: routesWithHooks.map((e) => ({
                routePath: e.routePath,
                importPath: e.hooksPath!,
            })),
        },
        plugins: { pluginsFileFound: !!pluginsFile, pluginsFile },
        // The scanner already resolves schema/openapi/config/hooks with
        // any of .ts/.js/.mjs.
        conventionFiles: {
            totalApiRoutes: apiEntries.length,
            schema: apiEntries.filter((e) => e.schemaPath).length,
            openapi: apiEntries.filter((e) => e.openapiPath).length,
            config: apiEntries.filter((e) => e.configPath).length,
            hooks: apiEntries.filter((e) => e.hooksPath).length,
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
        const problem = projectError();
        if (problem) {
            if (options.json) {
                console.log(JSON.stringify({ error: problem }));
            } else {
                logError(problem);
                info(PROJECT_HINT);
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
            const width = Math.max(
                4,
                ...apiEntries.map((e) => e.methods.join(', ').length)
            );
            for (const entry of apiEntries) {
                const methodStr = entry.methods.join(', ');
                bullet(
                    `${highlight(methodStr.padEnd(width))} ${entry.routePath} ${dimText(relTo(entry.importPath))}`
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
                    `${highlight('GET'.padEnd(4))} ${entry.routePath} ${dimText(relTo(entry.importPath))}`
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
                    `${highlight('WS'.padEnd(4))} ${entry.routePath} ${dimText(relTo(entry.importPath) + featureStr)}`
                );
            }
        }

        // Global hooks
        newline();
        header('Hooks');
        const globalFile = result.hooks.globalFile;
        if (globalFile && result.hooks.global.length > 0) {
            bullet(`Global: ${globalFile} (${result.hooks.global.join(', ')})`);
        } else if (globalFile) {
            bullet(`Global: ${globalFile} found, no hooks registered`);
        } else {
            bullet('Global: no src/hooks file');
        }

        // Route hooks
        for (const entry of result.hooks.routes) {
            bullet(`Route: ${entry.routePath} ${dimText(relTo(entry.importPath))}`);
        }

        // Plugins
        newline();
        header('Plugins');
        if (result.plugins.pluginsFile) {
            bullet(`${result.plugins.pluginsFile} found`);
        } else {
            bullet('No src/plugins file');
        }

        // Convention file stats
        newline();
        header('Convention Files');
        const { totalApiRoutes, schema, openapi, config: withConfig, hooks: withHooks } =
            result.conventionFiles;
        if (totalApiRoutes > 0) {
            bullet(`schema: ${schema}/${totalApiRoutes} routes`);
            bullet(`openapi: ${openapi}/${totalApiRoutes} routes`);
            bullet(`config: ${withConfig}/${totalApiRoutes} routes`);
            bullet(`hooks: ${withHooks}/${totalApiRoutes} routes`);
        }

        newline();
        success('Inspection complete.');
        newline();
    });
