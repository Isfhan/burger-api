/**
 * Build Commands
 *
 * Two commands for packaging your Burger API project:
 * 1. `burger-api build <file>`      — Bundle to .build/bundle/
 * 2. `burger-api build:exec <file>` — Compile to .build/executable/
 *
 * Both use build-time (AOT) route discovery — no filesystem scanning at runtime.
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { dirname } from 'path';
import {
    spinner,
    success,
    error as logError,
    info,
    newline,
    formatSize,
    dim,
} from '../utils/logger';
import { runVirtualEntryBuild } from '../utils/build/pipeline';
import { getProjectName } from '../utils/build/project';

/**
 * Options for the `build` command.
 */
interface BuildCommandOptions {
    outfile: string;
    minify?: boolean;
    sourcemap?: string;
    target?: string;
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
 *   .build/bundle/
 *     app.js             — Bun server (run with: bun .build/bundle/app.js)
 *     index.html         — HTML pages (flat, one per page route)
 *     style-[hash].css   — CSS assets (flat)
 *     app-[hash].js      — JS chunks (flat)
 *
 * API-only projects: app.js is a self-contained single file.
 * Projects with HTML pages: deploy the entire .build/bundle/ directory.
 */
export const buildCommand = new Command('build')
    .description('Bundle your project into .build/bundle/')
    .argument(
        '<file>',
        'Entry file (used for compatibility; config from burger.config.ts or conventions)'
    )
    .option('--outfile <path>', 'Output bundle path', '.build/bundle/app.js')
    .option('--minify', 'Minify the output')
    .option(
        '--sourcemap <type>',
        'Generate sourcemaps (inline, linked, or none)'
    )
    .option('--target <env>', 'Target environment (default: bun)')
    .action(async (_file: string, options: BuildCommandOptions) => {
        const cwd = process.cwd();
        const spin = spinner('Building project...');

        try {
            info('Build-time route discovery enabled.');

            const { success: ok, hasPages } = await runVirtualEntryBuild({
                cwd,
                outfile: options.outfile,
                target: options.target || 'bun',
                minify: options.minify,
                sourcemap: options.sourcemap,
            });

            if (!ok) {
                spin.stop('Build failed', true);
                logError(
                    'Bun.build failed. Check that api/page directories and route files are valid.'
                );
                process.exit(1);
            }

            const size = Bun.file(options.outfile).size;
            const bundleDir = dirname(options.outfile);

            spin.stop('Build completed successfully!');
            newline();
            success(`Bundle:  ${options.outfile}  (${formatSize(size)})`);
            newline();
            if (hasPages) {
                info(`Pages and assets are in: ${bundleDir}/`);
                dim(
                    'Deploy the entire directory — HTML pages depend on their chunks.'
                );
                dim(`Run: bun ${options.outfile}`);
            } else {
                info('API-only bundle — self-contained single file.');
                dim(`Run anywhere: bun ${options.outfile}`);
            }
            newline();
        } catch (err) {
            spin.stop('Build failed', true);
            logError(err instanceof Error ? err.message : 'Unknown error');
            process.exit(1);
        }
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
        'Entry file (used for compatibility; config from burger.config.ts or conventions)'
    )
    .option('--outfile <path>', 'Output executable path')
    .option(
        '--target <platform>',
        'Target platform (bun-windows-x64, bun-linux-x64, bun-darwin-arm64)'
    )
    .option('--minify', 'Minify the output (enabled by default)', true)
    .option('--no-bytecode', 'Disable bytecode compilation')
    .action(async (_file: string, options: BuildExecutableOptions) => {
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

        const spin = spinner('Compiling to executable...');

        try {
            info('Build-time route discovery enabled.');
            spin.update('Compiling... (this may take a minute)');

            const { success: ok, outputs } = await runVirtualEntryBuild({
                cwd,
                outfile,
                target: options.target,
                minify: options.minify,
                bytecode: options.bytecode !== false,
                compile: true,
            });

            if (!ok) {
                spin.stop('Compilation failed', true);
                logError(
                    'Bun.build failed. Check that api/page directories and route files are valid.'
                );
                process.exit(1);
            }

            const size = existsSync(outfile)
                ? Bun.file(outfile).size
                : (outputs[0]?.size ?? 0);

            spin.stop('Compilation completed successfully!');
            newline();
            success(`Executable: ${outfile}`);
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
                dim(`Make executable: chmod +x ${outfile}`);
                dim(`Run: ./${outfile}`);
            } else {
                dim(`Run: ${outfile}`);
            }
            newline();
        } catch (err) {
            spin.stop('Compilation failed', true);
            logError(err instanceof Error ? err.message : 'Unknown error');
            process.exit(1);
        }
    });
