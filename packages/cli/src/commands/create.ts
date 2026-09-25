/**
 * Create Command
 *
 * This command helps users create a new Burger API project.
 * It asks simple questions and sets up everything they need to get started.
 *
 * We use @clack/prompts for beautiful, user-friendly interactive prompts.
 */

import { Command, Option } from 'commander';
import * as clack from '@clack/prompts';
import { existsSync, rmSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import type { CreateOptions } from '../types/index';
import {
    createProject,
    installDependencies,
    burgerApiSourceOverride,
} from '../utils/templates';
import {
    success,
    error as logError,
    info,
    newline,
    header,
    command,
    highlight,
    warning,
} from '../utils/logger';

/** Windows reserved device names — invalid as directory names there. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Create the "create" command
 * This is what runs when users type: burger-api create <projectName>
 */
/**
 * Validate project name for filesystem compatibility
 * @param name - Project name to validate
 * @returns Error message if invalid, undefined if valid
 */
export function validateProjectName(name: string): string | undefined {
    if (!name) return 'Project name is required';
    if (name.length > 100)
        return 'Project name is too long (max 100 characters)';
    if (/^[.-]/.test(name))
        return 'Project name cannot start with a dot or dash';
    if (/[<>:"/\\|?*\x00-\x1F]/.test(name)) {
        return 'Project name contains invalid characters';
    }
    if (/\s/.test(name)) return 'Project name cannot contain spaces';
    if (WINDOWS_RESERVED.test(name)) {
        return `"${name}" is a reserved device name on Windows`;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(name)) {
        return 'Project name may only contain letters, digits, "-", "_", "." and "~"';
    }
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
    .option('-l, --lang <lang>', 'Project language: ts or js', 'ts')
    .option(
        '-y, --yes',
        'Use default answers for all prompts (non-interactive, alias: --defaults)'
    )
    // Commander accepts one short + one long flag per option, so `--defaults`
    // is registered separately (hidden) and folded into `yes` below.
    .addOption(new Option('--defaults').hideHelp())
    .option('--pages', 'Include page routes (src/pages)')
    .option('--ws', 'Include file-based WebSocket routes (src/websocket)')
    .option('--no-api', 'Skip API routes')
    .option('--api-dir <dir>', 'API routes directory under src/ (default: api)')
    .option('--api-prefix <prefix>', 'URL prefix for API routes (default: /api)')
    .option('--no-skills', 'Skip downloading AI agent skills')
    .addHelpText(
        'after',
        '\nFeature flags imply --yes (no prompts). Without a TTY (CI, pipes)\n' +
            'create never prompts: it uses the defaults plus any flags.\n\n' +
            'Examples:\n' +
            '  burger-api create my-api --yes\n' +
            '  burger-api create my-app --pages --ws --lang js\n' +
            '  burger-api create my-api --api-prefix /v1 --no-skills'
    )
    .action(async (
        projectName: string,
        options: CreateCommandOptions
    ) => {
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

            if (options.lang !== 'ts' && options.lang !== 'js') {
                clack.outro('Invalid language');
                logError(`--lang must be "ts" or "js" (got "${options.lang}")`);
                process.exit(1);
            }

            // Check if directory already exists
            const targetDir = join(process.cwd(), projectName);
            if (existsSync(targetDir)) {
                clack.outro('Directory already exists!');
                logError(`A directory named "${projectName}" already exists.`);
                process.exit(1);
            }

            // Ask user questions to configure the project. Feature flags
            // or a missing TTY mean non-interactive (prompts would hang).
            const hasFeatureFlags =
                options.pages !== undefined ||
                options.ws !== undefined ||
                options.api === false ||
                options.apiDir !== undefined ||
                options.apiPrefix !== undefined ||
                options.skills === false;
            const interactive =
                !options.yes &&
                !options.defaults &&
                !hasFeatureFlags &&
                Boolean(process.stdin.isTTY);
            if (!options.yes && !options.defaults && !hasFeatureFlags && !interactive) {
                info('No interactive terminal detected — using default answers (pass --yes to silence this).');
            }
            const answered = interactive
                ? await askQuestions(projectName)
                : applyFlags(defaultOptions(projectName), options);

            // User cancelled
            if (clack.isCancel(answered)) {
                clack.outro('Operation cancelled');
                process.exit(0);
            }

            const optionsWithLang: CreateOptions = {
                ...answered,
                lang: options.lang as 'ts' | 'js',
            };

            // Validate apiDir/pageDir stay under targetDir/src (prevent path traversal)
            if (optionsWithLang.useApi) {
                const apiDirError = validateDirUnderSrc(
                    targetDir,
                    optionsWithLang.apiDir || 'api',
                    'API directory'
                );
                if (apiDirError) {
                    clack.outro('Invalid configuration');
                    logError(apiDirError);
                    process.exit(1);
                }
            }
            if (optionsWithLang.usePages) {
                const pageDirError = validateDirUnderSrc(
                    targetDir,
                    optionsWithLang.pageDir || 'pages',
                    'Page directory'
                );
                if (pageDirError) {
                    clack.outro('Invalid configuration');
                    logError(pageDirError);
                    process.exit(1);
                }
            }
            if (optionsWithLang.useWs) {
                const wsDirError = validateDirUnderSrc(
                    targetDir,
                    optionsWithLang.wsDir || 'websocket',
                    'WebSocket directory'
                );
                if (wsDirError) {
                    clack.outro('Invalid configuration');
                    logError(wsDirError);
                    process.exit(1);
                }
            }

            // Show what we're about to create
            info('Creating project with the following configuration:');
            newline();
            console.log(` Name: ${projectName}`);
            console.log(
                ` Config File: burger.build.${options.lang === 'js' ? 'js' : 'ts'}`
            );
            if (optionsWithLang.useApi) {
                console.log(` API Routes: ${optionsWithLang.apiDir || 'api'}`);
            }
            if (optionsWithLang.usePages) {
                console.log(` Page Routes: ${optionsWithLang.pageDir || 'pages'}`);
            }
            if (optionsWithLang.useWs) {
                console.log(` WebSocket Routes: ${optionsWithLang.wsDir || 'websocket'}`);
            }
            if (optionsWithLang.addSkills) {
                console.log(` AI Agent Skills: burger-api`);
            }
            newline();

            //  Resolve burger-api from a local source
            const sourceOverride = burgerApiSourceOverride();
            if (sourceOverride) {
                info(`Using local burger-api: ${sourceOverride.label}`);
                newline();
            }

            // Create the project. On failure, remove the partial directory
            // so re-running with the same name works.
            let created;
            try {
                created = await createProject(targetDir, optionsWithLang);
                await installDependencies(targetDir);
            } catch (err) {
                rmSync(targetDir, { recursive: true, force: true });
                throw err;
            }

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
            // Only print URLs the fresh scaffold actually serves — `/` is a
            // 404 unless pages are enabled.
            const ext = optionsWithLang.lang === 'js' ? 'js' : 'ts';
            const base = 'http://localhost:4000';
            console.log(` 3. Open in your browser:`);
            if (optionsWithLang.usePages) {
                console.log(`    ${highlight(`${base}${optionsWithLang.pagePrefix}`)}  your pages`);
            }
            if (optionsWithLang.useApi) {
                console.log(`    ${highlight(`${base}${optionsWithLang.apiPrefix}`)}  your first API route`);
                console.log(`    ${highlight(`${base}/docs`)}  interactive API docs`);
            }
            newline();
            console.log(` 4. Start editing:`);
            if (optionsWithLang.useApi) {
                console.log(
                    `    ${highlight(`src/${optionsWithLang.apiDir}/route.${ext}`)}  routes are folders under src/${optionsWithLang.apiDir}/`
                );
            }
            console.log(`    ${highlight(`burger.build.${ext}`)}  build settings (dirs, prefixes)`);
            newline();
            console.log(` 5. Add hooks and plugins (optional):`);
            command('burger-api add cors logger');
            newline();
            if (created.skillsInstalled) {
                console.log(` 6. AI skills installed at`);
                console.log(`    ${highlight('.agents/skills/burger-api/')}`);
            } else if (created.skillsInstalled === false) {
                console.log(` 6. AI skills could not be downloaded — install them later:`);
                command('burger-api skills install');
            } else {
                console.log(` 6. Add AI skills (optional):`);
                command('burger-api skills install');
            }
            newline();
            if (created.skillsInstalled === false) {
                warning(`AI skills download failed: ${created.skillsError}`);
                newline();
            }
            success('Happy coding!');
        } catch (err) {
            clack.outro('Failed to create project');
            logError(err instanceof Error ? err.message : 'Unknown error');
            process.exit(1);
        }
    });

interface CreateCommandOptions {
    lang: string;
    yes?: boolean;
    defaults?: boolean;
    pages?: boolean;
    ws?: boolean;
    /** false with --no-api */
    api?: boolean;
    apiDir?: string;
    apiPrefix?: string;
    /** false with --no-skills */
    skills?: boolean;
}

/** Apply the non-interactive feature flags on top of the defaults. */
export function applyFlags(
    base: CreateOptions,
    flags: Omit<CreateCommandOptions, 'lang'>
): CreateOptions {
    const out = { ...base };
    if (flags.pages) out.usePages = true;
    if (flags.ws) out.useWs = true;
    if (flags.api === false) out.useApi = false;
    if (flags.apiDir !== undefined) out.apiDir = flags.apiDir;
    if (flags.apiPrefix !== undefined) {
        out.apiPrefix = flags.apiPrefix.startsWith('/')
            ? flags.apiPrefix
            : `/${flags.apiPrefix}`;
    }
    if (flags.skills === false) out.addSkills = false;
    return out;
}

/**
 * Default project options for non-interactive mode (`--yes`).
 * Mirrors the initial values of the interactive prompts.
 */
function defaultOptions(projectName: string): CreateOptions {
    return {
        name: projectName,
        useApi: true,
        apiDir: 'api',
        apiPrefix: '/api',
        debug: false,
        usePages: false,
        pageDir: 'pages',
        pagePrefix: '/',
        useWs: false,
        wsDir: 'websocket',
        addSkills: true,
    };
}

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

            // Question 8: Do you need file-based WebSocket routes?
            useWs: () =>
                clack.confirm({
                    message: 'Do you need WebSocket routes?',
                    initialValue: false,
                }),

            // Question 9: WebSocket directory (only if they said yes to WS)
            wsDir: ({ results }) =>
                results.useWs
                    ? clack.text({
                          message: 'WebSocket directory name:',
                          initialValue: 'websocket',
                          placeholder: 'websocket',
                          validate: (value) => {
                              if (!value)
                                  return 'Please enter a directory name';
                              if (value.includes(' '))
                                  return 'Directory name cannot contain spaces';
                              if (value.includes('..'))
                                  return 'Directory name cannot contain ..';
                          },
                      })
                    : Promise.resolve('websocket'),

            // Question 10: AI agent skills
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
        useWs: answers.useWs as boolean,
        wsDir: answers.wsDir as string | undefined,
        addSkills: answers.addSkills as boolean,
    };
}
