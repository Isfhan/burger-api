import { compareEntryAndBuildConfig, resolveBuildConfig } from '../config';
import { warning } from '../logger';
import {
    scanApiRoutes,
    scanAssetRoutes,
    scanPageRoutes,
    scanWebSocketRoutes,
} from '../scanner';
import {
    generateVirtualEntrySource,
    type AppConventionPaths,
} from '../virtual-entry';
import { createBunBuildOptions, runBunBuildOrThrow } from './bun';
import {
    cleanupVirtualEntry,
    finalizeBuildOutputs,
    prepareVirtualEntry,
} from './entry';
import { scaffoldPlatformConfig } from './platform-config';
import {
    cleanupEntryOptionsModule,
    prepareEntryOptionsModule,
} from '../entry-options';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { RUNTIME_CAPABILITIES, type RuntimeTarget } from '../../types/index';

/**
 * Rewrite absolute imports — and, with `sourceDir`, relative ones written
 * for that directory — to be relative to `outDir`: portable entries are
 * bundled later, possibly on another machine, so they must not embed this
 * machine's paths. Bare package specifiers (`burger-api`) are untouched.
 */
function rewriteImportsRelativeTo(
    source: string,
    outDir: string,
    sourceDir?: string
): string {
    return source.replace(
        /(from\s+|import\s+)'([^']+)'/g,
        (match, lead: string, spec: string) => {
            let abs: string | undefined;
            if (/^[A-Za-z]:\//.test(spec) || spec.startsWith('/')) abs = spec;
            else if (sourceDir && /^\.\.?\//.test(spec))
                abs = resolve(sourceDir, spec);
            if (!abs) return match;
            let rel = relative(outDir, abs).split('\\').join('/');
            if (!rel.startsWith('.')) rel = `./${rel}`;
            return `${lead}'${rel}'`;
        }
    );
}

/** Deploy targets whose bundle runs outside Bun (no Bun-only APIs). */
const PORTABLE_TARGETS: ReadonlySet<RuntimeTarget> = new Set([
    'cloudflare',
    'deno',
    'vercel',
    'node',
]);

/** Files the Bun-only scan reads (source extensions only). */
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]s|tsx)$/;

/**
 * Finds user source files that reach Bun-only APIs: `bun` / `bun:*` imports
 * or the `Bun.` global. Portable targets (Cloudflare, Deno, Vercel, Node)
 * cannot run them, so the build warns once and continues instead of letting
 * the deploy-time bundler fail with a bare resolution error.
 *
 * Local relative imports are followed, so a helper such as `src/db.ts`
 * imported by `src/providers.ts` is checked too.
 */
function findBunOnlyFiles(files: Array<string | undefined>): string[] {
    const scanner = new Bun.Transpiler({ loader: 'ts' });
    const flagged = new Set<string>();
    const seen = new Set<string>();
    const queue = files.filter((f): f is string => Boolean(f));
    while (queue.length > 0) {
        const file = queue.pop()!;
        if (seen.has(file) || !SOURCE_FILE_PATTERN.test(file)) continue;
        seen.add(file);
        let source: string;
        try {
            source = readFileSync(file, 'utf-8');
        } catch {
            // Missing optional file: the build itself will fail loud if needed.
            continue;
        }
        try {
            const imports = scanner.scanImports(source);
            if (
                // `typeof Bun` means the file feature-checks Bun and falls
                // back, so its `Bun.` uses are portable.
                (/\bBun\s*\./.test(source) &&
                    !/typeof\s+Bun\b/.test(source)) ||
                imports.some(
                    (i) => i.path === 'bun' || i.path.startsWith('bun:')
                )
            ) {
                flagged.add(file);
            }
            for (const i of imports) {
                if (!i.path.startsWith('.')) continue;
                const local = resolveLocalImport(dirname(file), i.path);
                if (local) queue.push(local);
            }
        } catch {
            // Unparseable file: the target bundler reports it with more context.
        }
    }
    return [...flagged];
}

/** Resolves `./db` / `./db.ts` / `./lib` (index file) to a source file path. */
function resolveLocalImport(fromDir: string, spec: string): string | undefined {
    const base = resolve(fromDir, spec);
    if (SOURCE_FILE_PATTERN.test(base) && existsSync(base)) return base;
    // `./db.js` written for ESM may point at `db.ts`.
    const stem = base.replace(/\.[cm]?js$/, '');
    for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
        if (existsSync(stem + ext)) return stem + ext;
    }
    for (const ext of ['.ts', '.js']) {
        const index = join(base, `index${ext}`);
        if (existsSync(index)) return index;
    }
    return undefined;
}

/**
 * Find app-level convention files next to the entry file: `hooks`,
 * `plugins`, `providers`, `openapi.config` with `.ts`, `.js` or `.mjs`.
 * Two variants of one file fail loud.
 */
export function scanAppConventions(
    appDir: string
): AppConventionPaths | undefined {
    const paths: AppConventionPaths = {};
    const find = (stem: string): string | undefined => {
        let found: string | undefined;
        for (const ext of ['.ts', '.js', '.mjs']) {
            const file = resolve(appDir, `${stem}${ext}`);
            if (!existsSync(file)) continue;
            if (found) {
                throw new Error(
                    `Conflicting convention files "${found}" and "${file}" — keep only one ${stem}.ts/.js/.mjs.`
                );
            }
            found = file;
        }
        return found?.split('\\').join('/');
    };
    paths.hooksPath = find('hooks');
    paths.pluginsPath = find('plugins');
    paths.providersPath = find('providers');
    paths.openapiConfigPath = find('openapi.config');
    return paths.hooksPath ||
        paths.pluginsPath ||
        paths.providersPath ||
        paths.openapiConfigPath
        ? paths
        : undefined;
}

export interface VirtualBuildResult {
    success: boolean;
    hasPages: boolean;
    hasWs: boolean;
    outputs: { path: string; size: number }[];
}

export async function runVirtualEntryBuild(options: {
    cwd: string;
    entryFile: string;
    outfile: string;
    /**
     * Raw Bun.build target passthrough: a compile OS/arch triple when
     * `compile` is true (`build:exec`'s `--target`), or `--target=browser`
     * for a client bundle. Most callers should leave this unset.
     */
    target?: string;
    /**
     * Deployment platform for `burger-api build --target`; defaults to
     * `burger.build.ts`'s `target`, then `'bun'`. Ignored when `compile` is
     * true — `--compile` only ever produces a Bun binary.
     */
    platformTarget?: RuntimeTarget;
    minify?: boolean;
    sourcemap?: string;
    compile?: boolean;
    bytecode?: boolean;
}): Promise<VirtualBuildResult> {
    const config = await resolveBuildConfig(options.cwd);
    // dev/start read options from the entry file; the build reads
    // burger.build. Warn when the two disagree.
    for (const msg of compareEntryAndBuildConfig(
        options.cwd,
        options.entryFile,
        config
    )) {
        warning(msg);
    }
    const platformTarget: RuntimeTarget = options.compile
        ? 'bun'
        : (options.platformTarget ?? config.target ?? 'bun');
    const entryOptions = prepareEntryOptionsModule({
        cwd: options.cwd,
        entryFile: options.entryFile,
    });

    const [apiEntries, pageEntries, wsEntries, assetEntries] =
        await Promise.all([
            scanApiRoutes(options.cwd, config.apiDir, config.apiPrefix),
            scanPageRoutes(options.cwd, config.pageDir, config.pagePrefix),
            scanWebSocketRoutes(options.cwd, config.wsDir ?? ''),
            scanAssetRoutes(options.cwd, config.pageDir, config.pagePrefix),
        ]);

    if (
        apiEntries.length === 0 &&
        pageEntries.length === 0 &&
        wsEntries.length === 0
    ) {
        cleanupEntryOptionsModule(entryOptions.tempFilePath);
        throw new Error(
            `No routes found. Ensure ${config.apiDir}, ${config.pageDir} ` +
                `or ${config.wsDir} exist and contain route.ts files, ` +
                `page files, or ws.ts files.`
        );
    }

    if (wsEntries.length > 0 && !RUNTIME_CAPABILITIES[platformTarget].websocket) {
        cleanupEntryOptionsModule(entryOptions.tempFilePath);
        throw new Error(
            `--target=${platformTarget} does not support WebSocket routes, ` +
                `but ${wsEntries.length} were found under ${config.wsDir}. ` +
                'This platform has no persistent-connection model for ' +
                'WebSocket upgrades — see the compatibility docs for what ' +
                'each runtime supports.'
        );
    }

    if (platformTarget === 'node') {
        try {
            Bun.resolveSync('@burger-api/node-server', options.cwd);
        } catch {
            cleanupEntryOptionsModule(entryOptions.tempFilePath);
            throw new Error(
                '--target=node requires the "@burger-api/node-server" ' +
                    'package, which is not installed in this project. ' +
                    'Run `bun add @burger-api/node-server` (or the npm/pnpm/yarn ' +
                    'equivalent) and try again.'
            );
        }
    }

    let appConventions: AppConventionPaths | undefined;
    try {
        appConventions = scanAppConventions(
            dirname(resolve(options.cwd, options.entryFile))
        );
    } catch (err) {
        cleanupEntryOptionsModule(entryOptions.tempFilePath);
        throw err;
    }

    // Portable targets run no Bun.build here; Bun-only user code would only
    // fail later in the target's own bundler. Warn once, then continue.
    if (PORTABLE_TARGETS.has(platformTarget)) {
        const bunOnly = findBunOnlyFiles([
            resolve(options.cwd, options.entryFile),
            ...apiEntries.flatMap((e) => [
                e.importPath,
                e.hooksPath,
                e.schemaPath,
                e.openapiPath,
                e.configPath,
            ]),
            ...wsEntries.flatMap((e) => [e.importPath, e.hooksPath, e.configPath]),
            ...pageEntries.map((e) => e.importPath),
            appConventions?.hooksPath,
            appConventions?.pluginsPath,
            appConventions?.providersPath,
            appConventions?.openapiConfigPath,
        ]);
        if (bunOnly.length > 0) {
            warning(
                `Bun-only APIs found for the "${platformTarget}" target, ` +
                    'which has no Bun runtime globals. Remove `bun`/`bun:*` ' +
                    'imports and `Bun.` usage from: ' +
                    bunOnly
                        .map((f) =>
                            relative(options.cwd, f).split('\\').join('/')
                        )
                        .join(', ')
            );
        }
    }

    const source = generateVirtualEntrySource(
        config,
        apiEntries,
        pageEntries,
        entryOptions.importPath,
        appConventions,
        wsEntries,
        assetEntries,
        // `--target=browser` bundles client code — never inject the Bun
        // adapter. Everything else follows the deploy target (bun gets it).
        options.target === 'browser' ? false : undefined,
        platformTarget
    );
    const hasPages = pageEntries.length > 0;
    const hasWs = wsEntries.length > 0;

    try {
        if (
            platformTarget === 'cloudflare' ||
            platformTarget === 'deno' ||
            platformTarget === 'vercel'
        ) {
            // No Bun.build here: wrangler/deno/vercel bundle the portable
            // source later, in a separate process, so nothing written here
            // may be a transient temp file — including the entry-options
            // module the outer `finally` deletes.
            const outPath = resolve(options.cwd, options.outfile);
            const portableOutDir = dirname(outPath);
            // Clear `.build/**` first so an earlier build's files never ship
            // with the new entry; a custom --outfile dir may hold user files.
            const relOutDir = relative(options.cwd, portableOutDir)
                .split('\\')
                .join('/');
            if (relOutDir === '.build' || relOutDir.startsWith('.build/')) {
                rmSync(portableOutDir, { recursive: true, force: true });
            }
            mkdirSync(portableOutDir, { recursive: true });

            let finalSource = source;
            if (
                entryOptions.tempFilePath &&
                existsSync(entryOptions.tempFilePath)
            ) {
                const optionsDest = resolve(
                    portableOutDir,
                    basename(entryOptions.tempFilePath)
                );
                // The options module carries the entry's prelude; its
                // relative imports were written for `src/` — re-point them.
                writeFileSync(
                    optionsDest,
                    rewriteImportsRelativeTo(
                        readFileSync(entryOptions.tempFilePath, 'utf-8'),
                        portableOutDir,
                        dirname(entryOptions.tempFilePath)
                    ),
                    'utf-8'
                );
                finalSource = finalSource.replace(
                    entryOptions.importPath!,
                    `./${basename(entryOptions.tempFilePath)}`
                );
            }
            finalSource = rewriteImportsRelativeTo(finalSource, portableOutDir);

            writeFileSync(outPath, finalSource, 'utf-8');
            scaffoldPlatformConfig(options.cwd, platformTarget, options.outfile);
            return {
                success: true,
                hasPages,
                hasWs,
                outputs: [
                    {
                        path: outPath,
                        size: Buffer.byteLength(finalSource, 'utf-8'),
                    },
                ],
            };
        }

        const { outDir, virtualPath, virtualSourcePath } = prepareVirtualEntry(
            {
                cwd: options.cwd,
                outfile: options.outfile,
                pageDir: config.pageDir,
                source,
                hasPages,
            }
        );

        try {
            const buildOptions = createBunBuildOptions({
                entryPath: virtualPath,
                outDir,
                cwd: options.cwd,
                outfile: options.outfile,
                // `compile` (build:exec) uses `options.target` as a Bun
                // compile OS/arch triple (e.g. 'bun-windows-x64') and stays
                // undefined when unset (Bun then targets the current
                // platform). Otherwise derive the Bun.build `target` from the
                // deployment platform.
                target: options.compile
                    ? options.target
                    : (options.target ??
                      (platformTarget === 'node' ? 'node' : 'bun')),
                minify: options.minify,
                sourcemap: options.sourcemap,
                compile: options.compile,
                bytecode: options.bytecode,
            });

            const result = await runBunBuildOrThrow(buildOptions);
            const outputs = await finalizeBuildOutputs({
                result,
                cwd: options.cwd,
                outfile: options.outfile,
                outDir,
                compile: options.compile,
            });
            return {
                success: result.success ?? false,
                hasPages,
                hasWs,
                outputs,
            };
        } finally {
            cleanupVirtualEntry(virtualSourcePath);
        }
    } finally {
        cleanupEntryOptionsModule(entryOptions.tempFilePath);
    }
}
