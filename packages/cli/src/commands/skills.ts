import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as clack from '@clack/prompts';
import { skillExists, downloadSkill, getSkillList, getSkillInfo } from '../utils/github';
import {
    spinner,
    success,
    error as logError,
    info,
    newline,
    header,
    bullet,
    table,
    withSpinner,
    command,
} from '../utils/logger';

/** Path to .agents/skills/ relative to project root */
function skillsDir(): string {
    return join(process.cwd(), '.agents', 'skills');
}

/** Ensure we're in a BurgerAPI project */
function requireProject(): void {
    if (!existsSync('package.json')) {
        clack.outro('Not in a BurgerAPI project');
        logError('Please run this command from a BurgerAPI project directory.');
        info('Create a new project with: burger-api create <name>');
        process.exit(1);
    }
}

/** Ensure .agents/skills/ directory exists */
async function ensureSkillsDir(): Promise<void> {
    const dir = skillsDir();
    if (!existsSync(dir)) {
        await Bun.write(join(dir, '.gitkeep'), '');
    }
}

/** Download logic shared by `install` and (potentially) `update` */
async function doInstall(skillName: string): Promise<void> {
    requireProject();
    await ensureSkillsDir();

    let spin = spinner(`Checking ${skillName}...`);

    let exists: boolean;
    try {
        exists = await skillExists(skillName);
    } catch {
        spin.stop('Could not connect to GitHub', true);
        logError('Please check your internet connection and try again.');
        process.exit(1);
    }

    if (!exists) {
        spin.stop(`Skill "${skillName}" not found on GitHub`, true);
        process.exit(1);
    }

    spin.update(`Downloading ${skillName}...`);

    const targetDir = join(skillsDir(), skillName);
    if (existsSync(targetDir)) {
        spin.stop();
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
        const filesDownloaded = await downloadSkill(skillName, targetDir);
        spin.stop(`Installed ${skillName} (${filesDownloaded} files)`);

        newline();
        success(`Skill "${skillName}" installed successfully!`);
        newline();

        header('What was installed');
        info(`.agents/skills/${skillName}/SKILL.md`);
        info(`.agents/skills/${skillName}/references/`);
        newline();

        header('Compatible Agents');
        info('This skill is automatically discovered by:');
        bullet('Cursor — reads from .agents/skills/');
        bullet('Claude Code — reads from .agents/skills/');
        bullet('OpenCode — reads from .agents/skills/');
        bullet('OpenAI Codex — reads from .agents/skills/');
        bullet('GitHub Copilot — reads from .agents/skills/');
        bullet('And any agent supporting the agentskills.io standard');
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
    .action(async (name: string) => {
        clack.intro('Install AI agent skills');
        await doInstall(name);
    });

/** burger-api skills list — list locally installed skills */
const listCommand = new Command('list')
    .description('List installed AI agent skills')
    .action(() => {
        requireProject();

        const dir = skillsDir();
        if (!existsSync(dir)) {
            clack.intro('Installed skills');
            info('No skills installed yet.');
            newline();
            info('Install the default skill:');
            info('  burger-api skills install');
            clack.outro('Done');
            process.exit(0);
        }

        const entries = readdirSync(dir, { withFileTypes: true });
        const skills = entries
            .filter((e) => e.isDirectory())
            .map((e) => {
                const skillPath = join(dir, e.name, 'SKILL.md');
                if (!existsSync(skillPath)) return null;
                const raw = readFileSync(skillPath, 'utf-8');
                const descLine = raw.split('\n').find((l) =>
                    l.startsWith('description:')
                );
                const description = descLine
                    ? descLine.slice('description:'.length).trim().replace(/^['"]|['"]$/g, '')
                    : '(no description)';
                return { name: e.name, description };
            })
            .filter(Boolean) as { name: string; description: string }[];

        clack.intro('Installed skills');
        if (skills.length === 0) {
            info('No valid skills found in .agents/skills/.');
            newline();
            info('Install the default skill:');
            info('  burger-api skills install');
        } else {
            for (const s of skills) {
                info(`  ${s.name} — ${s.description}`);
            }
            newline();
            header('Discovery');
            info('These skills are automatically detected by agentic IDEs.');
            info('No additional configuration needed.');
        }
        newline();
        clack.outro('Done');
    });

/** burger-api skills available — list remote skills from GitHub */
const availableCommand = new Command('available')
    .description('List available skills from the ecosystem')
    .action(async () => {
        clack.intro('Available skills');

        let list: string[];
        try {
            list = await withSpinner(
                'Fetching available skills...',
                () => getSkillList()
            );
        } catch {
            logError('Could not fetch skill list from GitHub.');
            process.exit(1);
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
