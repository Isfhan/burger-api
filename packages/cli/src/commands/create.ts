/**
 * Create Command
 *
 * This command helps users create a new Burger API project.
 * It asks simple questions and sets up everything they need to get started.
 *
 * We use @clack/prompts for beautiful, user-friendly interactive prompts.
 */

import { Command } from 'commander';
import * as clack from '@clack/prompts';
import { existsSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import type { CreateOptions } from '../types/index';
import { createProject, installDependencies } from '../utils/templates';
import {
    success,
    error as logError,
    info,
    newline,
    header,
    command,
    highlight,
} from '../utils/logger';

/**
 * Create the "create" command
 * This is what runs when users type: burger-api create <projectName>
 */
/**
 * Validate project name for filesystem compatibility
 * @param name - Project name to validate
 * @returns Error message if invalid, undefined if valid
 */
function validateProjectName(name: string): string | undefined {
    if (!name) return 'Project name is required';
    if (name.length > 100)
        return 'Project name is too long (max 100 characters)';
    if (/^[.-]/.test(name))
        return 'Project name cannot start with a dot or dash';
    if (/[<>:"/\\|?*\x00-\x1F]/.test(name)) {
        return 'Project name contains invalid characters';
    }
    if (/\s/.test(name)) return 'Project name cannot contain spaces';
    return undefined;
}

/**
 * Ensure directory name (apiDir/pageDir) resolves under targetDir/src to prevent path traversal.
 */
function validateDirUnderSrc(
    targetDir: string,
    dirName: string,
    label: string
): string | undefined {
    if (!dirName || dirName.includes('..')) {
        return `${label} cannot be empty or contain '..'`;
    }
    const srcRoot = resolve(targetDir, 'src');
    const resolved = resolve(targetDir, 'src', dirName);
    const rel = relative(srcRoot, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
        return `${label} must resolve inside the project's src directory`;
    }
    return undefined;
}

export const createCommand = new Command('create')
    .description('Create a new Burger API project')
    .argument('<project-name>', 'Name of your project')
    .action(async (projectName: string) => {
        // Start with a nice intro
        clack.intro('Create a new BurgerAPI project');

        try {
            // Validate project name
            const nameError = validateProjectName(projectName);
            if (nameError) {
                clack.outro('Invalid project name');
                logError(nameError);
                process.exit(1);
            }

            // Check if directory already exists
            const targetDir = join(process.cwd(), projectName);
            if (existsSync(targetDir)) {
                clack.outro('Directory already exists!');
                logError(`A directory named "${projectName}" already exists.`);
                process.exit(1);
            }

            // Ask user questions to configure the project
            const options = await askQuestions(projectName);

            // User cancelled
            if (clack.isCancel(options)) {
                clack.outro('Operation cancelled');
                process.exit(0);
            }

            // Validate apiDir/pageDir stay under targetDir/src (prevent path traversal)
            if (options.useApi) {
                const apiDirError = validateDirUnderSrc(
                    targetDir,
                    options.apiDir || 'api',
                    'API directory'
                );
                if (apiDirError) {
                    clack.outro('Invalid configuration');
                    logError(apiDirError);
                    process.exit(1);
                }
            }
            if (options.usePages) {
                const pageDirError = validateDirUnderSrc(
                    targetDir,
                    options.pageDir || 'pages',
                    'Page directory'
                );
                if (pageDirError) {
                    clack.outro('Invalid configuration');
                    logError(pageDirError);
                    process.exit(1);
                }
            }

            // Show what we're about to create
            info('Creating project with the following configuration:');
            newline();
            console.log(` Name: ${projectName}`);
            console.log(` Config File: burger.build.ts`);
            if (options.useApi) {
                console.log(` API Routes: ${options.apiDir || 'api'}`);
            }
            if (options.usePages) {
                console.log(` Page Routes: ${options.pageDir || 'pages'}`);
            }
            if (options.addSkills) {
                console.log(` AI Agent Skills: burger-api`);
            }
            newline();

            // Create the project
            await createProject(targetDir, options);

            // Install dependencies
            await installDependencies(targetDir);

            // Success! Show them what to do next
            clack.outro('Project created successfully!');
            newline();
            header('Next Steps');
            console.log(` 1. Navigate to your project:`);
            command(`cd ${projectName}`);
            newline();
            console.log(` 2. Start the development server:`);
            command('bun run dev');
            newline();
            console.log(` 3. Edit config if needed:`);
            command('burger.build.ts');
            newline();
            console.log(` 4. Open your browser:`);
            console.log(` ${highlight('http://localhost:4000')}`);
            newline();
            console.log(` 5. Add middleware (optional):`);
            command('burger-api add cors logger');
            newline();
            if (options.addSkills) {
                console.log(` 6. AI skills installed at`);
                console.log(` ${highlight('.agents/skills/burger-api/')}`);
            } else {
                console.log(` 6. Add AI skills (optional):`);
                command('burger-api skills install');
            }
            newline();
            success('Happy coding!');
        } catch (err) {
            clack.outro('Failed to create project');
            logError(err instanceof Error ? err.message : 'Unknown error');
            process.exit(1);
        }
    });

/**
 * Ask user questions to configure their project
 * Uses @clack/prompts for beautiful interactive prompts
 *
 * @param projectName - Name of the project
 * @returns Configuration options from user answers
 */
async function askQuestions(projectName: string): Promise<CreateOptions> {
    // Ask all questions in a nice flow
    const answers = await clack.group(
        {
            // Question 1: Do you need API routes?
            useApi: () =>
                clack.confirm({
                    message: 'Do you need API routes?',
                    initialValue: true,
                }),

            // Question 2: API directory (only if they said yes to API)
            apiDir: ({ results }) =>
                results.useApi
                    ? clack.text({
                          message: 'API directory name:',
                          initialValue: 'api',
                          placeholder: 'api',
                          validate: (value) => {
                              if (!value)
                                  return 'Please enter a directory name';
                              if (value.includes(' '))
                                  return 'Directory name cannot contain spaces';
                              if (value.includes('..'))
                                  return 'Directory name cannot contain ..';
                          },
                      })
                    : Promise.resolve('api'),

            // Question 3: API prefix (only if they said yes to API)
            apiPrefix: ({ results }) =>
                results.useApi
                    ? clack.text({
                          message: 'API route prefix:',
                          initialValue: '/api',
                          placeholder: '/api',
                      })
                    : Promise.resolve('/api'),

            // Question 4: Debug mode (only if they said yes to API)
            debug: ({ results }) =>
                results.useApi
                    ? clack.confirm({
                          message: 'Enable debug mode?',
                          initialValue: false,
                      })
                    : Promise.resolve(false),

            // Question 5: Do you need Page routes?
            usePages: () =>
                clack.confirm({
                    message: 'Do you need Page routes?',
                    initialValue: false,
                }),

            // Question 6: Page directory (only if they said yes to Pages)
            pageDir: ({ results }) =>
                results.usePages
                    ? clack.text({
                          message: 'Page directory name:',
                          initialValue: 'pages',
                          placeholder: 'pages',
                          validate: (value) => {
                              if (!value)
                                  return 'Please enter a directory name';
                              if (value.includes(' '))
                                  return 'Directory name cannot contain spaces';
                              if (value.includes('..'))
                                  return 'Directory name cannot contain ..';
                          },
                      })
                    : Promise.resolve('pages'),

            // Question 7: Page prefix (only if they said yes to Pages)
            pagePrefix: ({ results }) =>
                results.usePages
                    ? clack.text({
                          message: 'Page route prefix:',
                          initialValue: '/',
                          placeholder: '/',
                      })
                    : Promise.resolve('/'),

            // Question 8: AI agent skills
            addSkills: () =>
                clack.confirm({
                    message:
                        'Add AI agent skills? (recommended for agentic IDEs)',
                    initialValue: true,
                }),
        },
        {
            // Callback when user cancels (Ctrl+C)
            onCancel: () => {
                clack.cancel('Operation cancelled');
                process.exit(0);
            },
        }
    );

    // Return the configuration
    return {
        name: projectName,
        useApi: answers.useApi as boolean,
        apiDir: answers.apiDir as string | undefined,
        apiPrefix: answers.apiPrefix as string | undefined,
        debug: answers.debug as boolean | undefined,
        usePages: answers.usePages as boolean,
        pageDir: answers.pageDir as string | undefined,
        pagePrefix: answers.pagePrefix as string | undefined,
        addSkills: answers.addSkills as boolean,
    };
}
