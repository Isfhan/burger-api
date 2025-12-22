/**
 * Build Commands
 *
 * Two commands for packaging your Burger API project:
 * 1. `burger-api build <file>` - Bundle to single JS file
 * 2. `burger-api build:executable <file>` - Compile to standalone executable
 *
 * These are wrappers around Bun's build commands with sensible defaults.
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
    spinner,
    success,
    error as logError,
    info,
    newline,
    formatSize,
    dim,
} from '../utils/logger';

/**
 * Build command options
 */
interface BuildCommandOptions {
    outfile: string;
    minify?: boolean;
    sourcemap?: string;
    target?: string;
}

/**
 * Build executable command options
 */
interface BuildExecutableOptions {
    outfile?: string;
    target?: string;
    minify: boolean;
    bytecode: boolean;
}

/**
 * Create the "build" command
 * Bundles your code into a single JavaScript file
 */
export const buildCommand = new Command('build')
    .description('Bundle your project to a single JavaScript file')
    .argument('<file>', 'Entry file to build (e.g., index.ts)')
    .option('--outfile <path>', 'Output file path', '.build/bundle.js')
    .option('--minify', 'Minify the output')
    .option(
        '--sourcemap <type>',
        'Generate sourcemaps (inline, linked, or none)'
    )
    .option('--target <target>', 'Target environment (e.g., bun, node)')
    .action(async (file: string, options: BuildCommandOptions) => {
        // Check if the input file exists
        if (!existsSync(file)) {
            logError(`File not found: ${file}`);
            process.exit(1);
        }

        const spin = spinner('Building project...');

        try {
            // Build the command arguments for Bun
            const args = ['build', file];

            // Add output file
            args.push('--outfile', options.outfile);

            // Add optional flags
            if (options.minify) {
                args.push('--minify');
            }

            if (options.sourcemap) {
                args.push('--sourcemap', options.sourcemap);
            }

            // Always target bun by default since BurgerAPI uses Bun builtins
            args.push('--target', options.target || 'bun');

            // Run the build using Bun.spawn
            const proc = Bun.spawn(['bun', ...args], {
                stdout: 'pipe',
                stderr: 'pipe',
            });

            // Wait for it to complete
            const exitCode = await proc.exited;

            if (exitCode !== 0) {
                // Read error output
                const errorText = await new Response(proc.stderr).text();
                spin.stop('Build failed', true);
                logError(errorText || 'Build process failed');
                process.exit(1);
            }

            // Get file size
            const outputFile = Bun.file(options.outfile);
            const size = outputFile.size;

            spin.stop('Build completed successfully!');
            newline();
            success(`Output: ${options.outfile}`);
            info(`Size: ${formatSize(size)}`);
            newline();
            dim('Run your bundle with: bun ' + options.outfile);
            newline();
        } catch (err) {
            spin.stop('Build failed', true);
            logError(err instanceof Error ? err.message : 'Unknown error');
            process.exit(1);
        }
    });

/**
 * Create the "build:executable" command
 * Compiles your code to a standalone executable
 */
export const buildExecutableCommand = new Command('build:executable')
    .description('Compile your project to a standalone executable')
    .argument('<file>', 'Entry file to compile (e.g., index.ts)')
    .option('--outfile <path>', 'Output file path')
    .option(
        '--target <target>',
        'Target platform (bun-windows-x64, bun-linux-x64, bun-darwin-arm64)'
    )
    .option('--minify', 'Minify the output (enabled by default)', true)
    .option('--no-bytecode', 'Disable bytecode compilation')
    .action(async (file: string, options: BuildExecutableOptions) => {
        // Check if the input file exists
        if (!existsSync(file)) {
            logError(`File not found: ${file}`);
            process.exit(1);
        }

        // Determine output filename
        let outfile = options.outfile;
        if (!outfile) {
            // Get project name from package.json or use basename
            const projectName = getProjectName();

            // Add platform-specific extension
            // Check if targeting Windows or if we're on Windows without a specific target
            const isWindows =
                options.target?.includes('windows') ||
                (!options.target && process.platform === 'win32');

            if (isWindows) {
                outfile = `.build/${projectName}.exe`;
            } else {
                outfile = `.build/${projectName}`;
            }
        }

        const spin = spinner('Compiling to executable...');

        try {
            // Build the command arguments for Bun
            const args = ['build', file, '--compile'];

            // Add output file
            args.push('--outfile', outfile);

            // Add target platform
            if (options.target) {
                args.push('--target', options.target);
            }

            // Add minify (on by default)
            if (options.minify) {
                args.push('--minify');
            }

            // Add bytecode (on by default, unless --no-bytecode is passed)
            if (options.bytecode !== false) {
                args.push('--bytecode');
            }

            spin.update('Compiling... (this may take a minute)');

            // Run the build using Bun.spawn
            const proc = Bun.spawn(['bun', ...args], {
                stdout: 'pipe',
                stderr: 'pipe',
            });

            // Wait for it to complete
            const exitCode = await proc.exited;

            if (exitCode !== 0) {
                // Read error output
                const errorText = await new Response(proc.stderr).text();
                spin.stop('Compilation failed', true);
                logError(errorText || 'Compilation process failed');
                process.exit(1);
            }

            // Get file size - check if file exists first
            let size = 0;
            if (existsSync(outfile)) {
                const executableFile = Bun.file(outfile);
                size = executableFile.size;
            }

            spin.stop('Compilation completed successfully!');
            newline();
            success(`Executable: ${outfile}`);
            if (size > 0) {
                info(`Size: ${formatSize(size)}`);
            }
            newline();
            info('Your standalone executable is ready to run!');

            if (process.platform !== 'win32') {
                dim(`Make it executable: chmod +x ${outfile}`);
                dim(`Run it: ./${outfile}`);
            } else {
                dim(`Run it: ${outfile}`);
            }
            newline();
        } catch (err) {
            spin.stop('Compilation failed', true);
            logError(err instanceof Error ? err.message : 'Unknown error');
            process.exit(1);
        }
    });

/**
 * Get the project name from package.json
 * Falls back to 'app' if not found
 */
function getProjectName(): string {
    try {
        const packageJsonPath = join(process.cwd(), 'package.json');
        if (existsSync(packageJsonPath)) {
            const content = readFileSync(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(content);
            return packageJson?.name || 'app';
        }
    } catch (err) {
        // Ignore errors
    }
    return 'app';
}
