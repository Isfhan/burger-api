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

import { Command } from 'commander';
import { createCommand } from './commands/create';
import { addCommand } from './commands/add';
import { listCommand } from './commands/list';
import { buildCommand, buildExecutableCommand } from './commands/build';
import { serveCommand } from './commands/serve';
import { showBanner } from './utils/logger';

/**
 * Create the main CLI program
 * This is what runs when someone types 'burger-api' in their terminal
 */
const program = new Command();

// Set up basic information about our CLI
program
    .name('burger-api')
    .description('Simple tool to work with BurgerAPI projects')
    .version('0.1.1');

// Add all our commands to the CLI
// Each command is defined in its own file for better organization
program.addCommand(createCommand); // Create new projects
program.addCommand(addCommand); // Add middleware to projects
program.addCommand(listCommand); // List available middleware
program.addCommand(buildCommand); // Bundle to JS file
program.addCommand(buildExecutableCommand); // Compile to executable
program.addCommand(serveCommand); // Run development server

// Show banner + help when no command is provided
program.action(() => {
    showBanner();
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

// Run the CLI - this parses the arguments the user typed
program.parse();
