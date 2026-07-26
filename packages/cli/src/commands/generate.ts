/**
 * Generate Command (alias: g)
 *
 * Scaffolds routes, hooks, and plugins with convention files.
 *
 * Examples:
 *   burger-api generate route users
 *   burger-api g route products/[id]
 *   burger-api generate hook cors
 *   burger-api generate plugin jwt
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { resolveBuildConfig } from '../utils/config';
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

// ─────────────────────────────────────────────────────
// `generate route <name>`
// ─────────────────────────────────────────────────────

const routeCommand = new Command('route')
    .description('Scaffold a route directory with convention files')
    .argument('<path>', 'Route path (e.g. users, products/[id])')
    .option('--no-schema', 'Skip schema.ts')
    .option('--no-openapi', 'Skip openapi.ts')
    .option('--no-hooks', 'Skip hooks.ts')
    .option('--no-config', 'Skip config.ts')
    .action(async (routePath: string, options: GenerateRouteOptions) => {
        if (!existsSync('package.json')) {
            logError('Not in a BurgerAPI project directory.');
            info('Run this from your project root.');
            process.exit(1);
        }

        const config = await resolveBuildConfig(process.cwd());
        const targetDir = join(process.cwd(), config.apiDir, routePath);

        if (existsSync(targetDir)) {
            logError(`Route directory already exists: ${targetDir}`);
            info('Remove it first or choose a different name.');
            process.exit(1);
        }

        const files = generateRouteFiles(routePath, {
            schema: options.schema,
            openapi: options.openapi,
            hooks: options.hooks,
            config: options.config,
        });

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
        info('Edit route.ts to add your handlers.');
        if (files['schema.ts']) {
            info('Define validation schemas in schema.ts.');
        }
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate hook <name>`
// ─────────────────────────────────────────────────────

const hookCommand = new Command('hook')
    .description('Scaffold a hook factory in the ecosystem')
    .argument('<name>', 'Hook name')
    .action(async (name: string) => {
        if (!existsSync('package.json')) {
            logError('Not in a BurgerAPI project directory.');
            process.exit(1);
        }

        const targetDir = join(process.cwd(), 'ecosystem', 'hooks', name);
        if (existsSync(targetDir)) {
            logError(`Hook "${name}" already exists at ${targetDir}`);
            process.exit(1);
        }

        await mkdir(targetDir, { recursive: true });
        const content = generateHookTemplate(name);
        await writeFile(join(targetDir, `${name}.ts`), content);

        newline();
        success(`Hook "${name}" created at ${targetDir}`);
        newline();
        header('How to use');
        code(`import { ${name} } from "./ecosystem/hooks/${name}/${name}";`);
        code('');
        code('// src/hooks.ts');
        code('export const onRequest = [');
        code(`    ${name}(),`);
        code('];');
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate plugin <name>`
// ─────────────────────────────────────────────────────

const pluginCommand = new Command('plugin')
    .description('Scaffold a plugin in the ecosystem')
    .argument('<name>', 'Plugin name')
    .action(async (name: string) => {
        if (!existsSync('package.json')) {
            logError('Not in a BurgerAPI project directory.');
            process.exit(1);
        }

        const targetDir = join(process.cwd(), 'ecosystem', 'plugins', name);
        if (existsSync(targetDir)) {
            logError(`Plugin "${name}" already exists at ${targetDir}`);
            process.exit(1);
        }

        await mkdir(targetDir, { recursive: true });
        const content = generatePluginTemplate(name);
        const className = name.charAt(0).toUpperCase() + name.slice(1);
        await writeFile(join(targetDir, `${name}.ts`), content);

        newline();
        success(`Plugin "${className}" created at ${targetDir}`);
        newline();
        header('How to use');
        code(`import { ${className} } from "./ecosystem/plugins/${name}/${name}";`);
        code('');
        code('// src/plugins.ts');
        code('burger.usePlugin(');
        code(`    ${className},`);
        code(');');
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate ws <path>`
// ─────────────────────────────────────────────────────

const wsCommand = new Command('ws')
    .description('Scaffold a WebSocket handler directory with convention files')
    .argument('<path>', 'WebSocket path (e.g. chat, notifications/[room])')
    .option('--no-hooks', 'Skip hooks.ts')
    .option('--no-config', 'Skip config.ts')
    .action(async (routePath: string, options: GenerateWsOptions) => {
        if (!existsSync('package.json')) {
            logError('Not in a BurgerAPI project directory.');
            info('Run this from your project root.');
            process.exit(1);
        }

        const config = await resolveBuildConfig(process.cwd());
        const wsDir = join(process.cwd(), 'src', 'websocket', routePath);

        if (existsSync(wsDir)) {
            logError(`WebSocket directory already exists: ${wsDir}`);
            info('Remove it first or choose a different name.');
            process.exit(1);
        }

        const files = generateWsFiles(routePath, {
            hooks: options.hooks,
            config: options.config,
        });

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
        code(`// In your server entry point (e.g. src/index.ts):`);
        code(`const burger = new Burger({`);
        code(`    wsDir: "./src/websocket",`);
        code(`    // ... other options`);
        code(`});`);
        newline();
        info('Edit ws.ts to add your open/message/close handlers.');
        if (files['hooks.ts']) {
            info('Define route-level hooks in hooks.ts.');
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
