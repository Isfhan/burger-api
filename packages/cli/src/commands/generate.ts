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
import { mkdir, writeFile as fsWriteFile } from 'fs/promises';
import { isAbsolute, join, relative, resolve as resolvePath } from 'path';
import {
    CONVENTION_DEFAULTS,
    compareEntryAndBuildConfig,
    readEntryScanOptions,
    resolveBuildConfig,
} from '../utils/config';
import { ensureAppDirEnv } from '../utils/scanner';
import { getCachedComponentList } from '../utils/github';
import { reindent, isReindentable } from '../utils/reindent';
import {
    PROJECT_HINT,
    projectError,
    resolveEntryFile,
} from '../utils/build/project';
import {
    generateRouteFiles,
    generateHookTemplate,
    generatePluginTemplate,
    generateWsFiles,
    toIdentifier,
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
    warning,
} from '../utils/logger';

/** Writes a generated file, normalizing source indentation (see reindent.ts). */
const writeFile = (path: string, content: string) =>
    fsWriteFile(path, isReindentable(path) ? reindent(content) : content);

/** Path relative to cwd with forward slashes, for printing. */
const rel = (p: string): string =>
    relative(process.cwd(), p).split('\\').join('/') || '.';

/**
 * Best-effort, non-blocking check: does a real ecosystem hook/plugin
 * already exist under this name? `generate` scaffolds an empty local stub
 * regardless of the answer (see the plan's DRY note — this is an additive
 * hint, not a behavior change) — but a same-named real implementation
 * downloadable via `burger-api add` is worth surfacing before someone
 * fills in a blank file that already exists, tested, in the ecosystem.
 * Uses the cached catalog (`getCachedComponentList`), not a live
 * `detectEcosystemType` call, so this never turns an instant local command
 * into a network-dependent one — and any failure here (offline, cold
 * cache, GitHub down) is swallowed silently rather than blocking or
 * warning about an unrelated network issue.
 */
async function warnIfEcosystemComponentExists(name: string): Promise<void> {
    try {
        const { data: components } = await getCachedComponentList();
        const existing = components.find((c) => c.name === name);
        if (existing) {
            warning(
                `A real "${existing.kind}" named "${name}" already exists in the ecosystem catalog.`
            );
            info(
                `Consider "burger-api add ${name}" instead — it downloads the real, working implementation rather than a blank stub.`
            );
            newline();
        }
    } catch {
        // Best-effort only.
    }
}

/** Exit unless cwd is a BurgerAPI project (package.json lists burger-api). */
function ensureProject(): void {
    const problem = projectError();
    if (problem) {
        logError(problem);
        info(PROJECT_HINT);
        process.exit(1);
    }
}

/** Print an error and exit 1. */
function fail(message: string, hint?: string): never {
    logError(message);
    if (hint) info(hint);
    process.exit(1);
}

/**
 * Resolve the project language: explicit `--lang` flag wins, otherwise a
 * `jsconfig.json` in the project root marks a JavaScript project.
 */
function resolveLang(flag: string | undefined): 'ts' | 'js' {
    const lang = flag ?? (existsSync('jsconfig.json') ? 'js' : 'ts');
    if (lang !== 'ts' && lang !== 'js') {
        fail(`--lang must be "ts" or "js" (got "${lang}")`);
    }
    return lang;
}

/**
 * Validate a route/ws path like `users`, `products/[id]`, `(admin)/stats`,
 * `files/[...]`. Returns an error message, or undefined when valid.
 * Rejects absolute paths, `.`/`..` segments, whitespace and characters
 * that are invalid in file names, and named wildcards (`[...path]`), which
 * the router does not support.
 */
export function validateRoutePath(input: string): string | undefined {
    if (!input.trim()) return 'Path cannot be empty.';
    if (/\s/.test(input)) return `Path "${input}" cannot contain spaces.`;
    if (isAbsolute(input) || /^[\\/]/.test(input) || /^[A-Za-z]:/.test(input)) {
        return `Path "${input}" must be relative (e.g. users or products/[id]).`;
    }
    const segments = input.split(/[\\/]/).filter(Boolean);
    for (const seg of segments) {
        if (seg === '.' || seg === '..') {
            return `Path "${input}" cannot contain "." or ".." segments.`;
        }
        if (/^\[\.\.\..+\]$/.test(seg)) {
            return `Named wildcard folder "${seg}" is not supported — use "[...]" (the matched rest is available as ctx.wildcardParams).`;
        }
        if (/^\[[^\].]*\]$/.test(seg) && !/^\[[A-Za-z_$][\w$]*\]$/.test(seg)) {
            return `Dynamic segment "${seg}" must be a valid identifier, e.g. [id].`;
        }
        if (!/^[\w\-.~@()[\]]+$/.test(seg)) {
            return `Path segment "${seg}" contains invalid characters.`;
        }
    }
    return undefined;
}

/** `rate-limit`, `myHook`, `cors_v2` — a directory/file name that maps to a JS identifier. */
export function validateComponentName(name: string): string | undefined {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
        return `Invalid name "${name}" — use letters, digits, "-" or "_", starting with a letter (e.g. rate-limit).`;
    }
    return undefined;
}

/** Join `root` + validated relative path; exits if the result escapes `root`. */
function resolveUnder(root: string, relPath: string): string {
    const target = resolvePath(root, relPath);
    const r = relative(root, target);
    if (r.startsWith('..') || isAbsolute(r)) {
        fail(`"${relPath}" resolves outside ${rel(root)}/.`);
    }
    return target;
}

/**
 * Resolve a scan dir the same way scans do (project root, then src/). The
 * app-dir fallback only applies to bare paths — a config value already
 * prefixed with `src/` resolves against the project root (and is created
 * if it does not exist yet).
 */
function resolveScanRoot(dir: string): string {
    const appDir = process.env.BURGER_API_APP_DIR;
    const cwdRoot = resolvePath(process.cwd(), dir);
    const isSrcPrefixed = /^(\.\/)?src\//.test(dir.replace(/\\/g, '/'));
    return existsSync(cwdRoot)
        ? cwdRoot
        : !isSrcPrefixed && appDir
          ? resolvePath(appDir, dir)
          : cwdRoot;
}

/** Warn when src/index.* and burger.build disagree (dev vs build would differ). */
function warnConfigMismatch(
    config: Awaited<ReturnType<typeof resolveBuildConfig>>
): void {
    const entry = resolveEntryFile(undefined);
    for (const msg of compareEntryAndBuildConfig(process.cwd(), entry, config)) {
        warning(msg);
    }
}

// ─────────────────────────────────────────────────────
// `generate route <name>`
// ─────────────────────────────────────────────────────

const routeCommand = new Command('route')
    .description('Scaffold a route directory with convention files')
    .argument('<path>', 'Route path (e.g. users, products/[id], files/[...])')
    .option('-l, --lang <lang>', 'Project language: ts or js (detected from jsconfig.json)')
    .option('--no-schema', 'Skip schema.ts')
    .option('--no-openapi', 'Skip openapi.ts')
    .option('--no-hooks', 'Skip hooks.ts')
    .option('--no-config', 'Skip config.ts')
    .action(async (routePath: string, options: GenerateRouteOptions & { lang?: string }) => {
        ensureProject();
        const pathError = validateRoutePath(routePath);
        if (pathError) fail(pathError);
        routePath = routePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        const lang = resolveLang(options.lang);
        const config = await resolveBuildConfig(process.cwd());
        ensureAppDirEnv();
        // Resolve apiDir the same way scans do (project root, then src/)
        // so `generate route x` lands in src/api/x even with `apiDir: 'api'`.
        const apiRoot = resolveScanRoot(config.apiDir);
        const targetDir = resolveUnder(apiRoot, routePath);

        if (existsSync(targetDir)) {
            fail(
                `Route directory already exists: ${rel(targetDir)}`,
                'Remove it first or choose a different name.'
            );
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
        success(`Route "${routePath}" created at ${rel(targetDir)}/`);
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
        warnConfigMismatch(config);
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate hook <name>`
// ─────────────────────────────────────────────────────

const hookCommand = new Command('hook')
    .description('Scaffold a local hook factory in ecosystem/hooks/<name>/')
    .argument('<name>', 'Hook name (e.g. rate-limit → export rateLimit)')
    .option('-l, --lang <lang>', 'Project language: ts or js (detected from jsconfig.json)')
    .action(async (name: string, options: { lang?: string }) => {
        ensureProject();
        const nameError = validateComponentName(name);
        if (nameError) fail(nameError);

        const lang = resolveLang(options.lang);
        const ext = lang === 'js' ? 'js' : 'ts';
        const targetDir = resolveUnder(
            join(process.cwd(), 'ecosystem', 'hooks'),
            name
        );
        if (existsSync(targetDir)) {
            fail(`Hook "${name}" already exists at ${rel(targetDir)}/`);
        }

        await warnIfEcosystemComponentExists(name);

        await mkdir(targetDir, { recursive: true });
        const content = generateHookTemplate(name, lang);
        const identifier = toIdentifier(name);
        await writeFile(join(targetDir, `${name}.${ext}`), content);

        newline();
        success(`Hook "${name}" created at ${rel(targetDir)}/`);
        newline();
        header('How to use');
        code(`// src/hooks.${ext}`);
        code(`import { ${identifier} } from '../ecosystem/hooks/${name}/${name}';`);
        code('');
        code('export const onRequest = [');
        code(` ${identifier}(),`);
        code('];');
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate plugin <name>`
// ─────────────────────────────────────────────────────

const pluginCommand = new Command('plugin')
    .description('Scaffold a local plugin in ecosystem/plugins/<name>/')
    .argument('<name>', 'Plugin name (e.g. audit-log → export AuditLog)')
    .option('-l, --lang <lang>', 'Project language: ts or js (detected from jsconfig.json)')
    .action(async (name: string, options: { lang?: string }) => {
        ensureProject();
        const nameError = validateComponentName(name);
        if (nameError) fail(nameError);

        const lang = resolveLang(options.lang);
        const ext = lang === 'js' ? 'js' : 'ts';
        const targetDir = resolveUnder(
            join(process.cwd(), 'ecosystem', 'plugins'),
            name
        );
        if (existsSync(targetDir)) {
            fail(`Plugin "${name}" already exists at ${rel(targetDir)}/`);
        }

        await warnIfEcosystemComponentExists(name);

        await mkdir(targetDir, { recursive: true });
        const content = generatePluginTemplate(name, lang);
        // Same identifier the template exports.
        const className = toIdentifier(name, true);
        await writeFile(join(targetDir, `${name}.${ext}`), content);

        newline();
        success(`Plugin "${className}" created at ${rel(targetDir)}/`);
        newline();
        header('How to use');
        code(`// src/plugins.${ext}`);
        code(
            `import { ${className} } from '../ecosystem/plugins/${name}/${name}';`
        );
        code('');
        code('// inside the exported function:');
        code(`burger.usePlugin(${className});`);
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
        ensureProject();
        const pathError = validateRoutePath(routePath);
        if (pathError) fail(pathError);
        routePath = routePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        const lang = resolveLang(options.lang);
        const ext = lang === 'js' ? 'js' : 'ts';
        const config = await resolveBuildConfig(process.cwd());
        ensureAppDirEnv();
        const wsRoot = (config.wsDir || CONVENTION_DEFAULTS.wsDir || './src/websocket')
            .replace(/\\/g, '/');
        const resolvedWsRoot = resolveScanRoot(wsRoot);
        const wsDir = resolveUnder(resolvedWsRoot, routePath);

        if (existsSync(wsDir)) {
            fail(
                `WebSocket directory already exists: ${rel(wsDir)}`,
                'Remove it first or choose a different name.'
            );
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
        success(`WebSocket route "${routePath}" created at ${rel(wsDir)}/`);
        newline();
        header('Files created');
        for (const filename of Object.keys(files)) {
            bullet(filename);
        }
        newline();
        info(`Edit ws.${ext} to add your open/message/close handlers.`);
        if (files[`hooks.${ext}`]) {
            info('Define route-level hooks in the hooks file.');
        }

        // dev/start only serve file-based WebSocket routes from the wsDir
        // the entry file configures (or the ./src/websocket default).
        const entryFile = resolveEntryFile(undefined);
        const entryOptions = readEntryScanOptions(
            resolvePath(process.cwd(), entryFile)
        );
        const devWsDir =
            entryOptions?.values.wsDir ?? CONVENTION_DEFAULTS.wsDir ?? '';
        const devWsRoot = devWsDir ? resolveScanRoot(devWsDir) : undefined;
        if (
            entryOptions &&
            !entryOptions.dynamic.includes('wsDir') &&
            devWsRoot !== resolvedWsRoot
        ) {
            newline();
            warning(
                `${entryFile} does not serve WebSocket routes from ${rel(resolvedWsRoot)}/ — \`burger-api dev\` will not see this route.`
            );
            info(`Add this to the options in ${entryFile}:`);
            code(`const app = new Burger({`);
            code(` wsDir: './${rel(resolvedWsRoot)}',`);
            code(` // ... other options`);
            code(`});`);
        } else {
            warnConfigMismatch(config);
        }
        newline();
    });

// ─────────────────────────────────────────────────────
// `generate` (parent command)
// ─────────────────────────────────────────────────────

export const generateCommand = new Command('generate')
    .description('Scaffold routes, WebSocket routes, and local hooks/plugins')
    .alias('g')
    .addCommand(routeCommand)
    .addCommand(hookCommand)
    .addCommand(pluginCommand)
    .addCommand(wsCommand);
