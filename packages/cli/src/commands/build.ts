/**
 * Build Commands
 *
 * Two commands for packaging your Burger API project:
 * 1. `burger-api build <file>` — Bundle to .build/bundle/
 * 2. `burger-api build:exec <file>` — Compile to .build/executable/
 *
 * Both use build-time (AOT) route discovery — no filesystem scanning at runtime.
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import type { Spinner } from '../utils/logger';
import {
    spinner,
    success,
    error as logError,
    info,
    newline,
    formatSize,
    dim,
} from '../utils/logger';
import {
    runVirtualEntryBuild,
    type VirtualBuildResult,
} from '../utils/build/pipeline';
import { getProjectName } from '../utils/build/project';
import { ensureAppDirEnv } from '../utils/scanner';
import { VALID_TARGETS } from '../utils/config';
import type { RuntimeTarget } from '../types/index';

/** Where each target's bundle lands by default, absent an explicit `--outfile`. */
function defaultOutfile(
    target: RuntimeTarget,
    compile: boolean,
    cwd: string
): string {
    if (compile) {
        const projectName = getProjectName(cwd);
        return process.platform === 'win32'
            ? `.build/executable/${projectName}.exe`
            : `.build/executable/${projectName}`;
    }
    if (target === 'vercel') {
        // Vercel's zero-config detection requires the entry at this path.
        return 'api/index.ts';
    }
    if (target === 'cloudflare' || target === 'deno') {
        return `.build/${target}/index.ts`;
    }
    return '.build/bundle/app.js';
}

/**
 * Validates `--target`. `'browser'` is accepted as a legacy escape hatch
 * (raw `Bun.build({ target: 'browser' })` passthrough for bundling
 * client-side code) and is not a deployment platform — it never reaches
 * `RUNTIME_CAPABILITIES` or the codegen branch, so it isn't included in the
 * error's list of real targets.
 */
function validatePlatformTarget(raw: string | undefined): RuntimeTarget {
    if (!raw) return 'bun';
    if ((VALID_TARGETS as string[]).includes(raw)) return raw as RuntimeTarget;
    logError(
        `Unknown --target "${raw}". Valid targets: ${VALID_TARGETS.join(', ')} (or "browser" to bundle client-side code as-is).`
    );
    process.exit(1);
}

function ensureEntryFileExists(cwd: string, file: string): void {
    const entryPath = resolve(cwd, file);
    if (!existsSync(entryPath)) {
        logError(`Entry file not found: ${file}`);
        info('Make sure you are in the project directory.');
        process.exit(1);
    }
    // Entry-relative path fallback for scan dirs (apiDir/pageDir/wsDir),
    // matching what `burger-api dev` provides at runtime.
    ensureAppDirEnv(file);
}

async function runBuildWithSpinner(params: {
    file: string;
    cwd: string;
    spinMessage: string;
    failMessage: string;
    buildOptions: Parameters<typeof runVirtualEntryBuild>[0];
    onBeforeBuild?: (spin: Spinner) => void;
    onSuccess: (result: VirtualBuildResult, spin: Spinner) => void;
}): Promise<void> {
    ensureEntryFileExists(params.cwd, params.file);
    const spin = spinner(params.spinMessage);
    try {
        info('Build-time route discovery enabled.');
        params.onBeforeBuild?.(spin);
        const result = await runVirtualEntryBuild(params.buildOptions);
        if (!result.success) {
            spin.stop(params.failMessage, true);
            logError(
                'Bun.build failed. Check that api/page directories and route files are valid.'
            );
            process.exit(1);
        }
        params.onSuccess(result, spin);
    } catch (err) {
        spin.stop(params.failMessage, true);
        logError(err instanceof Error ? err.message : 'Unknown error');
        process.exit(1);
    }
}

/**
 * Options for the `build` command.
 */
interface BuildCommandOptions {
    outfile?: string;
    minify?: boolean;
    sourcemap?: string;
    target?: string;
    compile?: boolean;
    bytecode?: boolean;
}

/**
 * Options for the `build:exec` command.
 */
interface BuildExecutableOptions {
    outfile?: string;
    target?: string;
    minify: boolean;
    bytecode: boolean;
}

/**
 * `burger-api build <file>`
 *
 * Bundles your project into .build/bundle/ using AOT route discovery.
 *
 * Output:
 * .build/bundle/
 * app.js — Bun server (run with: bun .build/bundle/app.js)
 * index.html — HTML pages (flat, one per page route)
 * style-[hash].css — CSS assets (flat)
 * app-[hash].js — JS chunks (flat)
 *
 * API-only projects: app.js is a self-contained single file.
 * Projects with HTML pages: deploy the entire .build/bundle/ directory.
 */
export const buildCommand = new Command('build')
    .description('Build your project for a deployment target')
    .argument(
        '<file>',
        'Entry file (used for compatibility; config from burger.build.ts or conventions)'
    )
    .option(
        '--outfile <path>',
        'Output path (default depends on --target — see docs/cli/build)'
    )
    .option('--minify', 'Minify the output (bun/node targets only)')
    .option(
        '--sourcemap <type>',
        'Generate sourcemaps (inline, linked, or none — bun/node targets only)'
    )
    .option(
        '--target <platform>',
        `Deployment target: ${VALID_TARGETS.join(', ')} (default: bun)`
    )
    .option(
        '--compile',
        'Compile to a standalone executable instead of bundling (bun target only)'
    )
    .option('--no-bytecode', 'Disable bytecode compilation (--compile only)')
    .action(async (file: string, options: BuildCommandOptions) => {
        const cwd = process.cwd();
        const platformTarget = validatePlatformTarget(
            options.target === 'browser' ? undefined : options.target
        );
        const isBrowserPassthrough = options.target === 'browser';

        if (options.compile && platformTarget !== 'bun') {
            logError(
                `--compile only supports --target=bun (got --target=${options.target}). ` +
                    'Compiling to a standalone binary is Bun-only.'
            );
            process.exit(1);
        }
        if (options.compile && isBrowserPassthrough) {
            logError('--compile cannot be combined with --target=browser.');
            process.exit(1);
        }

        const outfile =
            options.outfile ??
            defaultOutfile(platformTarget, Boolean(options.compile), cwd);

        await runBuildWithSpinner({
            file,
            cwd,
            spinMessage: options.compile
                ? 'Compiling to executable...'
                : 'Building project...',
            failMessage: options.compile ? 'Compilation failed' : 'Build failed',
            buildOptions: {
                cwd,
                entryFile: file,
                outfile,
                target: isBrowserPassthrough ? 'browser' : undefined,
                platformTarget,
                minify: options.minify,
                sourcemap: options.sourcemap,
                compile: options.compile,
                bytecode: options.bytecode !== false,
            },
            onBeforeBuild: (spin) => {
                if (options.compile) {
                    spin.update('Compiling... (this may take a minute)');
                }
            },
            onSuccess: (result, spin) => {
                if (options.compile) {
                    const size = existsSync(outfile)
                        ? Bun.file(outfile).size
                        : (result.outputs[0]?.size ?? 0);
                    spin.stop('Compilation completed successfully!');
                    newline();
                    success(`Executable: ${outfile}`);
                    if (size > 0) info(`Size: ${formatSize(size)}`);
                    newline();
                    info(
                        'Standalone binary — copy it anywhere, no Bun required on the target.'
                    );
                    newline();
                    if (process.platform !== 'win32') {
                        dim(`Make executable: chmod +x ${outfile}`);
                        dim(`Run: ./${outfile}`);
                    } else {
                        dim(`Run: ${outfile}`);
                    }
                    newline();
                    return;
                }

                spin.stop('Build completed successfully!');
                newline();
                const size = existsSync(outfile) ? Bun.file(outfile).size : 0;
                success(`Output: ${outfile}${size ? ` (${formatSize(size)})` : ''}`);
                newline();

                if (platformTarget === 'cloudflare') {
                    info('Cloudflare Workers — bundled by wrangler, not this CLI.');
                    dim(`Run: wrangler dev`);
                    dim(`Deploy: wrangler deploy`);
                } else if (platformTarget === 'deno') {
                    info('Deno Deploy — bundled by deno, not this CLI.');
                    dim(`Run: deno serve --port 4000 ${outfile}`);
                } else if (platformTarget === 'vercel') {
                    info('Vercel — bundled by vercel, not this CLI.');
                    dim('Deploy: vercel deploy');
                } else if (platformTarget === 'node') {
                    info('Node.js — self-contained single file.');
                    dim(`Run anywhere: node ${outfile}`);
                } else if (result.hasPages) {
                    const bundleDir = dirname(outfile);
                    info(`Pages and assets are in: ${bundleDir}/`);
                    dim(
                        'Deploy the entire directory — HTML pages depend on their chunks.'
                    );
                    dim(`Run: bun ${outfile}`);
                } else {
                    info('API-only bundle — self-contained single file.');
                    dim(`Run anywhere: bun ${outfile}`);
                }
                newline();
            },
        });
    });

/**
 * `burger-api build:exec <file>`
 *
 * Compiles your project into a standalone binary in .build/executable/.
 * The binary is fully self-contained — no Bun installation required on the target.
 * All routes, pages, and assets are embedded inside the binary.
 */
export const buildExecutableCommand = new Command('build:exec')
    .description(
        'Compile your project to a standalone executable in .build/executable/'
    )
    .argument(
        '<file>',
        'Entry file (used for compatibility; config from burger.build.ts or conventions)'
    )
    .option('--outfile <path>', 'Output executable path')
    .option(
        '--target <platform>',
        'Target platform (bun-windows-x64, bun-linux-x64, bun-darwin-arm64)'
    )
    .option('--minify', 'Minify the output (enabled by default)', true)
    .option('--no-bytecode', 'Disable bytecode compilation')
    .action(async (file: string, options: BuildExecutableOptions) => {
        const cwd = process.cwd();
        let outfile = options.outfile;
        if (!outfile) {
            const projectName = getProjectName(cwd);
            const isWindows =
                options.target?.includes('windows') ||
                (!options.target && process.platform === 'win32');
            outfile = isWindows
                ? `.build/executable/${projectName}.exe`
                : `.build/executable/${projectName}`;
        }
        const outfileFinal = outfile;

        await runBuildWithSpinner({
            file,
            cwd,
            spinMessage: 'Compiling to executable...',
            failMessage: 'Compilation failed',
            buildOptions: {
                cwd,
                entryFile: file,
                outfile,
                target: options.target,
                minify: options.minify,
                bytecode: options.bytecode !== false,
                compile: true,
            },
            onBeforeBuild: (spin) =>
                spin.update('Compiling... (this may take a minute)'),
            onSuccess: (result, spin) => {
                const size = existsSync(outfileFinal)
                    ? Bun.file(outfileFinal).size
                    : (result.outputs[0]?.size ?? 0);
                spin.stop('Compilation completed successfully!');
                newline();
                success(`Executable: ${outfileFinal}`);
                if (size > 0) info(`Size: ${formatSize(size)}`);
                newline();
                info(
                    'Standalone binary — copy it anywhere, no Bun required on the target.'
                );
                dim(
                    'All routes, pages, and assets are embedded inside the binary.'
                );
                newline();
                if (process.platform !== 'win32') {
                    dim(`Make executable: chmod +x ${outfileFinal}`);
                    dim(`Run: ./${outfileFinal}`);
                } else {
                    dim(`Run: ${outfileFinal}`);
                }
                newline();
            },
        });
    });
