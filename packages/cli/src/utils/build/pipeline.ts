import { resolveBuildConfig } from '../config';
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
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { RUNTIME_CAPABILITIES, type RuntimeTarget } from '../../types/index';

/**
 * Deno enforces spec-legal ES module specifiers — a bare absolute path like
 * `C:/Users/.../route.ts` (what the scanner emits, and what Bun/wrangler's
 * bundlers happily accept as a convenience) is rejected with "Unsupported
 * scheme". Rewriting every absolute-path import to a proper `file://` URL
 * is the fix; relative imports (the entry-options module) and bare package
 * specifiers (`burger-api`) are left untouched.
 */
function rewriteAbsoluteImportsToFileUrls(source: string): string {
    return source.replace(/from '([^']+)'/g, (match, spec: string) => {
        if (/^[A-Za-z]:\//.test(spec)) return `from 'file:///${spec}'`;
        if (spec.startsWith('/')) return `from 'file://${spec}'`;
        return match;
    });
}

function scanAppConventions(cwd: string): AppConventionPaths | undefined {
    const srcDir = resolve(cwd, 'src');
    const paths: AppConventionPaths = {};
    const hooksFile = resolve(srcDir, 'hooks.ts');
    if (existsSync(hooksFile))
        paths.hooksPath = hooksFile.split('\\').join('/');
    const pluginsFile = resolve(srcDir, 'plugins.ts');
    if (existsSync(pluginsFile))
        paths.pluginsPath = pluginsFile.split('\\').join('/');
    const providersFile = resolve(srcDir, 'providers.ts');
    if (existsSync(providersFile))
        paths.providersPath = providersFile.split('\\').join('/');
    const openapiConfigFile = resolve(srcDir, 'openapi.config.ts');
    if (existsSync(openapiConfigFile))
        paths.openapiConfigPath = openapiConfigFile.split('\\').join('/');
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

    const appConventions = scanAppConventions(options.cwd);

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
            mkdirSync(portableOutDir, { recursive: true });

            let finalSource = source;
            if (
                entryOptions.tempFilePath &&
                existsSync(entryOptions.tempFilePath)
            ) {
                const optionsDest = resolve(
                    portableOutDir,
                    '__burger_build_options__.ts'
                );
                copyFileSync(entryOptions.tempFilePath, optionsDest);
                finalSource = finalSource.replace(
                    entryOptions.importPath!,
                    './__burger_build_options__.ts'
                );
            }
            if (platformTarget === 'deno') {
                finalSource = rewriteAbsoluteImportsToFileUrls(finalSource);
            }

            writeFileSync(outPath, finalSource, 'utf-8');
            scaffoldPlatformConfig(options.cwd, platformTarget, options.outfile);
            return {
                success: true,
                hasPages,
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
            return { success: result.success ?? false, hasPages, outputs };
        } finally {
            cleanupVirtualEntry(virtualSourcePath);
        }
    } finally {
        cleanupEntryOptionsModule(entryOptions.tempFilePath);
    }
}
