/**
 * Generate Command (alias: g)
 *
 * Scaffolds routes, hooks, and plugins with convention files.
 *
 * Examples:
 * burger-api generate route users
 * burger-api g route products/[id]
 * burger-api generate hook cors
 * burger-api generate plugin jwt
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname, resolve as resolvePath } from 'path';
import { resolveBuildConfig } from '../utils/config';
import { ensureAppDirEnv } from '../utils/scanner';
import {
    generateRouteFiles,
    generateHookTemplate,
    generatePluginTemplate,
    generateWsFiles,
    type GenerateRouteOptions,
    type GenerateWsOptions,
} from '../utils/templates';
import {
    success,
    error as logError,
    info,
    newline,
    bullet,
    code,
    header,
} from '../utils/logger';

/**
 * Resolve the project language: explicit `--lang` flag wins, otherwise a
 * `jsconfig.json` in the project root marks a JavaScript project.
 */
function resolveLang(flag: string | undefined): 'ts' | 'js' {
    const lang = flag ?? (existsSync('jsconfig.json') ? 'js' : 'ts');
    if (lang !== 'ts' && lang !== 'js') {
        logError(`--lang must be "ts" or "js" (got "${lang}")`);
        process.exit(1);
    }
    return lang;
}

// ─────────────────────────────────────────────────────
// `generate route <name>`
// ─────────────────────────────────────────────────────

const routeCommand = new Command('route')
    .description('Scaffold a route directory with convention files')
    .argument('<path>', 'Route path (e.g. users, products/[id])')
    .option('-l, --lang <lang>', 'Project language: ts or js (detected from jsconfig.json)')
    .option('--no-schema', 'Skip schema.ts')
    .option('--no-openapi', 'Skip openapi.ts')
    .option('--no-hooks', 'Skip hooks.ts')
    .option('--no-config', 'Skip config.ts')
    .action(async (routePath: string, options: GenerateRouteOptions & { lang?: string }) => {
        if (!existsSync('package.json')) {
            logError('Not in a BurgerAPI project directory.');
            info('Run this from your project root.');
            process.exit(1);
        }

        const lang = resolveLang(options.lang);
        const config = await resolveBuildConfig(process.cwd());
        ensureAppDirEnv();
        // Resolve apiDir the same way scans do (project root, then src/)
        // so `generate route x` lands in src/api/x even with `apiDir: 'api'`.
        // The app-dir fallback only applies to bare paths — a config value
        // already prefixed with `src/` resolves against the project root.
        const appDir = process.env.BURGER_API_APP_DIR;
        const cwdApiRoot = resolvePath(process.cwd(), config.apiDir);
        const isSrcPrefixed = /^(\.\/)?src\//.test(config.apiDir);
        const apiRoot = existsSync(cwdApiRoot)
            ? cwdApiRoot
            : !isSrcPrefixed && appDir
              ? resolvePath(appDir, config.apiDir)
              : cwdApiRoot;
        const targetDir = join(apiRoot, routePath);

        if (existsSync(targetDir)) {
            logError(`Route directory already exists: ${targetDir}`);
            info('Remove it first or choose a different name.');
            process.exit(1);
        }

        const files = generateRouteFiles(
            routePath,
            {
                schema: options.schema,
                openapi: options.openapi,
                hooks: options.hooks,
                config: options.config,
            },
            lang
        );

        await mkdir(targetDir, { recursive: true });

        for (const [filename, content] of Object.entries(files)) {
            await writeFile(join(targetDir, filename), content);
        }

        newline();
        success(`Route "${routePath}" created at ${targetDir}`);
        newline();
        header('Files created');
        for (const filename of Object.keys(files)) {
            bullet(filename);
        }
        newline();
        info(`Edit route.${lang === 'js' ? 'js' : 'ts'} to add your handlers.`);
        if (files[`schema.${lang === 'js' ? 'js' : 'ts'}`]) {
            info('Define validation schemas in the schema file.');
        }
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate hook <name>`
// ─────────────────────────────────────────────────────

const hookCommand = new Command('hook')
    .description('Scaffold a hook factory in the ecosystem')
    .argument('<name>', 'Hook name')
    .option('-l, --lang <lang>', 'Project language: ts or js (detected from jsconfig.json)')
    .action(async (name: string, options: { lang?: string }) => {
        if (!existsSync('package.json')) {
            logError('Not in a BurgerAPI project directory.');
            process.exit(1);
        }

        const lang = resolveLang(options.lang);
        const ext = lang === 'js' ? 'js' : 'ts';
        const targetDir = join(process.cwd(), 'ecosystem', 'hooks', name);
        if (existsSync(targetDir)) {
            logError(`Hook "${name}" already exists at ${targetDir}`);
            process.exit(1);
        }

        await mkdir(targetDir, { recursive: true });
        const content = generateHookTemplate(name, lang);
        await writeFile(join(targetDir, `${name}.${ext}`), content);

        newline();
        success(`Hook "${name}" created at ${targetDir}`);
        newline();
        header('How to use');
        code(`import { ${name} } from "./ecosystem/hooks/${name}/${name}.${ext}";`);
        code('');
        code(`// src/hooks.${ext}`);
        code('export const onRequest = [');
        code(` ${name}(),`);
        code('];');
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate plugin <name>`
// ─────────────────────────────────────────────────────

const pluginCommand = new Command('plugin')
    .description('Scaffold a plugin in the ecosystem')
    .argument('<name>', 'Plugin name')
    .option('-l, --lang <lang>', 'Project language: ts or js (detected from jsconfig.json)')
    .action(async (name: string, options: { lang?: string }) => {
        if (!existsSync('package.json')) {
            logError('Not in a BurgerAPI project directory.');
            process.exit(1);
        }

        const lang = resolveLang(options.lang);
        const ext = lang === 'js' ? 'js' : 'ts';
        const targetDir = join(process.cwd(), 'ecosystem', 'plugins', name);
        if (existsSync(targetDir)) {
            logError(`Plugin "${name}" already exists at ${targetDir}`);
            process.exit(1);
        }

        await mkdir(targetDir, { recursive: true });
        const content = generatePluginTemplate(name, lang);
        const className = name.charAt(0).toUpperCase() + name.slice(1);
        await writeFile(join(targetDir, `${name}.${ext}`), content);

        newline();
        success(`Plugin "${className}" created at ${targetDir}`);
        newline();
        header('How to use');
        code(
            `import { ${className} } from "./ecosystem/plugins/${name}/${name}.${ext}";`
        );
        code('');
        code(`// src/plugins.${ext}`);
        code('burger.usePlugin(');
        code(` ${className},`);
        code(');');
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate ws <path>`
// ─────────────────────────────────────────────────────

const wsCommand = new Command('ws')
    .description('Scaffold a WebSocket handler directory with convention files')
    .argument('<path>', 'WebSocket path (e.g. chat, notifications/[room])')
    .option('-l, --lang <lang>', 'Project language: ts or js (detected from jsconfig.json)')
    .option('--no-hooks', 'Skip hooks.ts')
    .option('--no-config', 'Skip config.ts')
    .action(async (routePath: string, options: GenerateWsOptions & { lang?: string }) => {
        if (!existsSync('package.json')) {
            logError('Not in a BurgerAPI project directory.');
            info('Run this from your project root.');
            process.exit(1);
        }

        const lang = resolveLang(options.lang);
        const ext = lang === 'js' ? 'js' : 'ts';
        const config = await resolveBuildConfig(process.cwd());
        ensureAppDirEnv();
        // Resolve wsDir the same way scans do (project root, then src/).
        const appDir = process.env.BURGER_API_APP_DIR;
        const wsRoot = (config.wsDir || 'src/websocket').replace(/\\/g, '/');
        const cwdWsRoot = resolvePath(process.cwd(), wsRoot);
        // Same rule as apiDir: the app-dir fallback only applies to bare
        // paths; a `src/`-prefixed wsDir resolves against the project root
        // (and is created here if it does not exist yet).
        const isSrcPrefixed = /^(\.\/)?src\//.test(wsRoot);
        const resolvedWsRoot = existsSync(cwdWsRoot)
            ? cwdWsRoot
            : !isSrcPrefixed && appDir
              ? resolvePath(appDir, wsRoot)
              : cwdWsRoot;
        const wsDir = join(resolvedWsRoot, routePath);

        if (existsSync(wsDir)) {
            logError(`WebSocket directory already exists: ${wsDir}`);
            info('Remove it first or choose a different name.');
            process.exit(1);
        }

        const files = generateWsFiles(
            routePath,
            {
                hooks: options.hooks,
                config: options.config,
            },
            lang
        );

        await mkdir(wsDir, { recursive: true });

        for (const [filename, content] of Object.entries(files)) {
            await writeFile(join(wsDir, filename), content);
        }

        newline();
        success(`WebSocket route "${routePath}" created at ${wsDir}`);
        newline();
        header('Files created');
        for (const filename of Object.keys(files)) {
            bullet(filename);
        }
        newline();
        header('How to use');
        code(`// In your server entry point (e.g. src/index.${ext}):`);
        code(`const burger = new Burger({`);
        code(` wsDir: "./${wsRoot.replace(/^\.\//, '')}",`);
        code(` // ... other options`);
        code(`});`);
        newline();
        info(`Edit ws.${ext} to add your open/message/close handlers.`);
        if (files[`hooks.${ext}`]) {
            info('Define route-level hooks in the hooks file.');
        }
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate` (parent command)
// ─────────────────────────────────────────────────────

export const generateCommand = new Command('generate')
    .description('Scaffold routes, hooks, and plugins')
    .alias('g')
    .addCommand(routeCommand)
    .addCommand(hookCommand)
    .addCommand(pluginCommand)
    .addCommand(wsCommand);
