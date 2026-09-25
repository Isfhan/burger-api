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
import { basename, dirname, relative, resolve } from 'path';
import { RUNTIME_CAPABILITIES, type RuntimeTarget } from '../../types/index';

/**
 * Portable entries (cloudflare/deno/vercel) are bundled later by the
 * platform's own tool, often on another machine (CI), so they must not
 * embed this machine's absolute paths (`C:/Users/.../route.ts`). Every
 * absolute import — and, with `sourceDir`, every relative import written
 * for a file that lived in `sourceDir` — is rewritten relative to `outDir`.
 * Relative specifiers are also spec-legal for Deno (bare absolute paths are
 * rejected there). Bare package specifiers (`burger-api`) are untouched.
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

/**
 * App-level convention files live next to the entry file (like the
 * runtime scanner): `hooks`, `plugins`, `providers`, `openapi.config` with
 * `.ts`, `.js` or `.mjs` — a JS project's `src/hooks.js` must reach the
 * production bundle just like `src/hooks.ts`. Two variants of one file
 * fail loud.
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
     * `compile` is true (`build:exec`'s `--target`), or the legacy
     * `--target=browser` client-bundle escape hatch. Independent of
     * `platformTarget` below — most callers should leave this unset.
     */
    target?: string;
    /**
     * Deployment platform for `burger-api build --target`. Defaults to
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
    // dev/start read the entry file's options; the build reads burger.build.
    // Never let the two disagree silently.
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

    const source = generateVirtualEntrySource(
        config,
        apiEntries,
        pageEntries,
        entryOptions.importPath,
        appConventions,
        wsEntries,
        assetEntries,
        options.compile,
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
            // No Bun.build here — these targets have no long-running process
            // to bundle for; the platform's own tool (wrangler/deno/vercel)
            // bundles the portable source file directly, the same way the
            // hand-written deploy examples already do. That tool runs later,
            // in a separate process, so (unlike the Bun.build path) nothing
            // this build produces can be a transient temp file — including
            // the entry-options module, which the outer `finally` deletes.
            const outPath = resolve(options.cwd, options.outfile);
            const portableOutDir = dirname(outPath);
            // Clean the target output dir first so files from an earlier
            // build never ship alongside the new entry. Only `.build/**`
            // is cleared wholesale — a custom --outfile may share its
            // directory with unrelated user files.
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
                // The options module carries the entry file's prelude, whose
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
                // compile OS/arch triple (e.g. 'bun-windows-x64') and must
                // stay undefined when the caller didn't ask for one — Bun's
                // compiler then defaults to the current platform. Only the
                // regular bundling path derives its Bun.build `target`
                // (bundler output format) from the deployment platform.
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
