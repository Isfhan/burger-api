/**
 * Local AI agent skill folders and install helpers.
 *
 * Every skill is installed twice: `.claude/skills/<name>/` (Claude Code's
 * project skills folder) and `.agents/skills/<name>/` (the Agent Skills
 * standard used by other agents). Files are downloaded once and copied.
 */

import {
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
} from 'fs';
import { dirname, join } from 'path';
import { downloadSkill } from './github';

/** The two project folders a skill can live in. */
export interface SkillDirs {
    /** `.agents/skills/` under the project root */
    agents: string;
    /** `.claude/skills/` under the project root */
    claude: string;
}

/** The two skill folders for a project (defaults to the current directory). */
export function skillDirs(baseDir: string = process.cwd()): SkillDirs {
    return {
        agents: join(baseDir, '.agents', 'skills'),
        claude: join(baseDir, '.claude', 'skills'),
    };
}

/** Human-readable folder names, in display order. */
const LOCATION_LABELS: Array<[keyof SkillDirs, string]> = [
    ['agents', '.agents/skills'],
    ['claude', '.claude/skills'],
];

/** True when the skill exists in either folder. */
export function isSkillInstalled(
    skillName: string,
    baseDir: string = process.cwd()
): boolean {
    const dirs = skillDirs(baseDir);
    return (
        existsSync(join(dirs.agents, skillName)) ||
        existsSync(join(dirs.claude, skillName))
    );
}

/**
 * Download a skill to `.agents/skills/<name>/`, then copy it to
 * `.claude/skills/<name>/`.
 *
 * @param skillName - Name of the skill to install
 * @param options - Base directory and an optional downloader (for tests)
 * @returns Number of files downloaded
 */
export async function installSkill(
    skillName: string,
    options: {
        baseDir?: string;
        download?: (name: string, targetDir: string) => Promise<number>;
    } = {}
): Promise<number> {
    const baseDir = options.baseDir ?? process.cwd();
    const download = options.download ?? downloadSkill;
    const dirs = skillDirs(baseDir);
    const agentsTarget = join(dirs.agents, skillName);
    const claudeTarget = join(dirs.claude, skillName);

    const filesDownloaded = await download(skillName, agentsTarget);

    // Copy over any previous install so no stale files are left behind.
    mkdirSync(dirname(claudeTarget), { recursive: true });
    rmSync(claudeTarget, { recursive: true, force: true });
    cpSync(agentsTarget, claudeTarget, { recursive: true });

    return filesDownloaded;
}

/** A skill found on disk, with every folder it was found in. */
export interface LocalSkillInfo {
    name: string;
    description: string;
    /** Folder names, e.g. `['.agents/skills', '.claude/skills']` */
    locations: string[];
}

/**
 * Read both skill folders; each skill is listed once, with its locations.
 *
 * @param baseDir - Project root (defaults to the current directory)
 * @returns Installed skills, sorted by name
 */
export function listInstalledSkills(
    baseDir: string = process.cwd()
): LocalSkillInfo[] {
    const dirs = skillDirs(baseDir);
    const found = new Map<string, LocalSkillInfo>();

    for (const [key, label] of LOCATION_LABELS) {
        const dir = dirs[key];
        if (!existsSync(dir)) continue;

        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const skillPath = join(dir, entry.name, 'SKILL.md');
            if (!existsSync(skillPath)) continue;

            const existing = found.get(entry.name);
            if (existing) {
                existing.locations.push(label);
                continue;
            }
            found.set(entry.name, {
                name: entry.name,
                description: readSkillDescription(skillPath),
                locations: [label],
            });
        }
    }

    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** `description:` line from a SKILL.md frontmatter block. */
function readSkillDescription(skillPath: string): string {
    const raw = readFileSync(skillPath, 'utf-8');
    const descLine = raw.split('\n').find((l) => l.startsWith('description:'));
    return descLine
        ? descLine
              .slice('description:'.length)
              .trim()
              .replace(/^['"]|['"]$/g, '')
        : '(no description)';
}
