import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import * as clack from '@clack/prompts';
import {
    skillExists,
    getCachedSkillList,
    getSkillInfo,
} from '../utils/github';
import {
    installSkill,
    isSkillInstalled,
    listInstalledSkills,
    skillDirs,
} from '../utils/skills';
import { announceLocalMode, setLocalMode } from '../utils/local-mode';
import {
    spinner,
    success,
    error as logError,
    info,
    newline,
    header,
    table,
    withSpinner,
    command,
    warning,
} from '../utils/logger';

/** Ensure we're in a BurgerAPI project */
function requireProject(): void {
    if (!existsSync('package.json')) {
        clack.outro('Not in a BurgerAPI project');
        logError('Please run this command from a BurgerAPI project directory.');
        info('Create a new project with: burger-api create <name>');
        process.exit(1);
    }
}

/** Ensure both skill folders (`.agents/skills/` and `.claude/skills/`) exist */
function ensureSkillDirs(): void {
    const dirs = skillDirs();
    for (const dir of [dirs.agents, dirs.claude]) {
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }
}

/** Shared download logic for installing a skill. */
async function doInstall(skillName: string, force = false): Promise<void> {
    requireProject();
    ensureSkillDirs();

    let spin = spinner(`Checking ${skillName}...`);

    let exists: boolean;
    try {
        exists = await skillExists(skillName);
    } catch (err) {
        spin.stop('Could not check the skill on GitHub', true);
        logError(
            err instanceof Error
                ? err.message
                : 'Please check your internet connection and try again.'
        );
        process.exit(1);
    }

    if (!exists) {
        spin.stop(`Skill "${skillName}" not found on GitHub`, true);
        process.exit(1);
    }

    spin.update(`Downloading ${skillName}...`);

    // Installed if either folder has it; overwriting replaces both.
    if (isSkillInstalled(skillName) && !force) {
        spin.stop();
        if (!process.stdin.isTTY) {
            // No terminal to answer the prompt (CI, pipes) — never hang.
            logError(
                `${skillName} is already installed in .agents/skills/ or .claude/skills/ — pass --force to overwrite, run in a terminal to confirm, or remove those folders first.`
            );
            process.exit(1);
        }
        const shouldOverwrite = await clack.confirm({
            message: `${skillName} already exists. Overwrite?`,
            initialValue: false,
        });
        if (clack.isCancel(shouldOverwrite) || !shouldOverwrite) {
            info(`Skipped ${skillName}`);
            process.exit(0);
        }
        spin = spinner(`Downloading ${skillName}...`);
    }

    try {
        const filesDownloaded = await installSkill(skillName);
        spin.stop(`Installed ${skillName} (${filesDownloaded} files)`);

        newline();
        success(`Skill "${skillName}" installed successfully!`);
        newline();

        header('What was installed');
        info(`.agents/skills/${skillName}/SKILL.md`);
        info(`.agents/skills/${skillName}/references/`);
        info(`.claude/skills/${skillName}/SKILL.md`);
        info(`.claude/skills/${skillName}/references/`);
        newline();

        header('Compatible Agents');
        info('This skill is automatically discovered by:');
        info('Claude Code: .claude/skills/');
        info(
            'Agents that support the Agent Skills standard (OpenCode, Codex, and others): .agents/skills/'
        );
        newline();

        header('How It Works');
        info('The agent loads the skill when relevant to your task.');
        info('Just start working — the skill activates automatically.');
        newline();

        clack.outro('Skills ready!');
    } catch (err) {
        spin.stop('Download failed', true);
        logError(err instanceof Error ? err.message : 'Unknown error');
        process.exit(1);
    }
}

// ── Subcommands ──────────────────────────────────────────────────────────────

/** burger-api skills install [name] — install a skill (defaults to burger-api) */
const installCommand = new Command('install')
    .description('Install an AI agent skill from the ecosystem')
    .argument('[name]', 'Name of the skill to install', 'burger-api')
    .option('--force', 'Overwrite an existing install without prompting')
    .option(
        '--local',
        'Use the local burger-api checkout (bun link) instead of npm/GitHub'
    )
    .action(
        async (
            name: string,
            options: { force?: boolean; local?: boolean }
        ) => {
            clack.intro('Install AI agent skills');
            setLocalMode(options.local);
            announceLocalMode();
            await doInstall(name, options.force === true);
        }
    );

/** burger-api skills list — list locally installed skills */
const listCommand = new Command('list')
    .description('List installed AI agent skills')
    .action(() => {
        requireProject();

        const skills = listInstalledSkills();

        clack.intro('Installed skills');
        if (skills.length === 0) {
            info('No skills installed yet.');
            newline();
            info('Install the default skill:');
            info(' burger-api skills install');
        } else {
            for (const s of skills) {
                info(` ${s.name} — ${s.description}`);
                info(`   installed in ${s.locations.join(', ')}`);
            }
            newline();
            header('Discovery');
            info('Claude Code reads .claude/skills/.');
            info(
                'Agents that support the Agent Skills standard (OpenCode, Codex, and others) read .agents/skills/.'
            );
        }
        newline();
        clack.outro('Done');
    });

/** burger-api skills available — list remote skills from GitHub */
const availableCommand = new Command('available')
    .description('List available skills from the ecosystem')
    .option(
        '--local',
        'Use the local burger-api checkout (bun link) instead of npm/GitHub'
    )
    .action(async (options: { local?: boolean }) => {
        clack.intro('Available skills');
        setLocalMode(options.local);
        announceLocalMode();

        let list: string[];
        let stale = false;
        try {
            ({ data: list, stale } = await withSpinner(
                'Fetching available skills...',
                () => getCachedSkillList()
            ));
        } catch (err) {
            logError(
                err instanceof Error
                    ? err.message
                    : 'Could not fetch skill list from GitHub.'
            );
            process.exit(1);
        }

        if (stale) {
            warning(
                'GitHub is unreachable — showing a cached list, which may be out of date.'
            );
            newline();
        }

        if (list.length === 0) {
            info('No skills available yet.');
            newline();
            clack.outro('Done');
            process.exit(0);
        }

        const rows: string[][] = [['Name', 'Description']];
        for (const name of list) {
            let description = '';
            try {
                const info = await getSkillInfo(name);
                description = info.description;
            } catch {
                description = '(could not fetch)';
            }
            rows.push([
                name,
                description.length > 60
                    ? description.substring(0, 57) + '...'
                    : description,
            ]);
        }
        table(rows);
        newline();
        info('To install a skill, run:');
        command('burger-api skills install <name>');
        newline();
        clack.outro('Done');
    });

// ── Parent command ──────────────────────────────────────────────────────────

/** burger-api skills — top-level namespace for skill management */
export const skillsCommand = new Command('skills')
    .description('Manage AI agent skills')
    .addCommand(installCommand)
    .addCommand(listCommand)
    .addCommand(availableCommand);
