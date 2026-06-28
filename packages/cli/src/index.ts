#!/usr/bin/env bun

/**
 * BurgerAPI CLI Tool
 *
 * This is the main entry point for the CLI.
 * It sets up all the commands users can run.
 *
 * We use commander to handle command parsing and routing.
 * This makes it easy to add new commands and provide helpful error messages.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Command } from 'commander';
import { createCommand } from './commands/create';
import { addCommand } from './commands/add';
import { skillsCommand } from './commands/skills';
import { listCommand } from './commands/list';
import { buildCommand, buildExecutableCommand } from './commands/build';
import { serveCommand } from './commands/serve';
import { showBanner } from './utils/logger';

/** Injected at build time when compiling to executable (--define CLI_VERSION). */
declare const CLI_VERSION: string | undefined;

/**
 * Read CLI version from package.json (single source of truth for publish).
 * When running as compiled binary, version is injected at build time via CLI_VERSION.
 * @returns The version of the CLI.
 */
function getVersion(): string {
    if (typeof CLI_VERSION !== 'undefined') {
        return CLI_VERSION;
    }
    try {
        const pkgPath = join(import.meta.dir, '..', 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
            version?: string;
        };
        return pkg.version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
}

/**
 * Create the main CLI program
 * This is what runs when someone types 'burger-api' in their terminal
 */
const program = new Command();

// Set up basic information about our CLI
program
    .name('burger-api')
    .description('Simple tool to work with BurgerAPI projects')
    .version(getVersion());

// Add all our commands to the CLI
// Each command is defined in its own file for better organization
program.addCommand(createCommand); // Create new projects
program.addCommand(addCommand); // Add middleware to projects
program.addCommand(skillsCommand); // Manage agent skills: burger-api skills install
program.addCommand(listCommand); // List available middleware
program.addCommand(buildCommand); // Bundle to JS file
program.addCommand(buildExecutableCommand); // Compile to executable
program.addCommand(serveCommand); // Run development server

// Show banner + help when no command is provided
program.action(() => {
    showBanner(getVersion());
    program.help();
});

// Override the help display to include banner
program.configureOutput({
    writeOut: (str) => {
        process.stdout.write(str);
    },
    writeErr: (str) => {
        process.stderr.write(str);
    },
});

// Use exit code 2 for usage errors (invalid options/args) per CLI guidelines
const USAGE_ERROR_CODES = [
    'commander.unknownOption',
    'commander.unknownArgument',
    'commander.missingMandatoryOptionValue',
    'commander.invalidOptionArgument',
    'commander.invalidArgument',
];
program.exitOverride((err) => {
    const errorCode = (err as { code?: string }).code;
    const code =
        err.exitCode === 0
            ? 0
            : typeof errorCode === 'string' &&
                USAGE_ERROR_CODES.includes(errorCode)
              ? 2
              : 1;
    process.exit(code);
});

function isCommanderProcessExit(err: unknown): err is { exitCode: number } {
    return (
        typeof err === 'object' &&
        err !== null &&
        'exitCode' in err &&
        typeof (err as { exitCode: unknown }).exitCode === 'number' &&
        Number.isInteger((err as { exitCode: number }).exitCode)
    );
}

// Run the CLI — parseAsync so async command actions rejections are handled here
await program.parseAsync(process.argv).catch((err: unknown) => {
    if (isCommanderProcessExit(err)) {
        process.exit(err.exitCode);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
