import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    installSkill,
    isSkillInstalled,
    listInstalledSkills,
    skillDirs,
} from '../src/utils/skills';

const createdDirs: string[] = [];

async function tempProject(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), `burger-skills-${prefix}-`));
    createdDirs.push(dir);
    return dir;
}

/** Writes the files a skill download would produce. */
async function writeSkillFiles(targetDir: string): Promise<void> {
    await mkdir(join(targetDir, 'references'), { recursive: true });
    await writeFile(
        join(targetDir, 'SKILL.md'),
        '---\ndescription: Test skill\n---\n\n# Skill'
    );
    await writeFile(join(targetDir, 'references', 'routing.md'), '# Routing');
    await writeFile(join(targetDir, 'references', 'cli.md'), '# CLI');
}

afterAll(async () => {
    for (const dir of createdDirs) {
        await rm(dir, { recursive: true, force: true });
    }
});

describe('skillDirs', () => {
    it('returns both project skill folders', () => {
        const dirs = skillDirs(join('some', 'project'));
        expect(dirs.agents).toBe(join('some', 'project', '.agents', 'skills'));
        expect(dirs.claude).toBe(join('some', 'project', '.claude', 'skills'));
    });
});

describe('installSkill', () => {
    it('downloads once and copies the skill to both folders', async () => {
        const dir = await tempProject('both');
        const downloads: Array<{ name: string; target: string }> = [];

        const files = await installSkill('burger-api', {
            baseDir: dir,
            download: async (name, target) => {
                downloads.push({ name, target });
                await writeSkillFiles(target);
                return 3;
            },
        });

        expect(files).toBe(3);
        expect(downloads).toHaveLength(1);
        expect(downloads[0]?.name).toBe('burger-api');

        const agentsSkill = join(dir, '.agents', 'skills', 'burger-api');
        const claudeSkill = join(dir, '.claude', 'skills', 'burger-api');
        expect(existsSync(join(agentsSkill, 'SKILL.md'))).toBe(true);
        expect(existsSync(join(claudeSkill, 'SKILL.md'))).toBe(true);
        expect(existsSync(join(claudeSkill, 'references', 'routing.md'))).toBe(
            true
        );

        // Same content in both places.
        expect(await readFile(join(claudeSkill, 'SKILL.md'), 'utf8')).toBe(
            await readFile(join(agentsSkill, 'SKILL.md'), 'utf8')
        );
    });

    it('replaces a stale copy in .claude/skills/', async () => {
        const dir = await tempProject('stale');
        const claudeSkill = join(dir, '.claude', 'skills', 'burger-api');
        await mkdir(claudeSkill, { recursive: true });
        await writeFile(join(claudeSkill, 'old-and-gone.md'), '# stale');

        await installSkill('burger-api', {
            baseDir: dir,
            download: async (_name, target) => {
                await writeSkillFiles(target);
                return 3;
            },
        });

        expect(existsSync(join(claudeSkill, 'old-and-gone.md'))).toBe(false);
        expect(existsSync(join(claudeSkill, 'SKILL.md'))).toBe(true);
    });
});

describe('isSkillInstalled', () => {
    it('is true when the skill exists in either folder', async () => {
        const dir = await tempProject('installed');

        expect(isSkillInstalled('burger-api', dir)).toBe(false);

        await mkdir(join(dir, '.claude', 'skills', 'burger-api'), {
            recursive: true,
        });
        expect(isSkillInstalled('burger-api', dir)).toBe(true);

        await rm(join(dir, '.claude'), { recursive: true, force: true });
        await mkdir(join(dir, '.agents', 'skills', 'burger-api'), {
            recursive: true,
        });
        expect(isSkillInstalled('burger-api', dir)).toBe(true);
    });
});

describe('listInstalledSkills', () => {
    it('lists a skill found in both folders only once', async () => {
        const dir = await tempProject('dedupe');
        for (const root of ['.agents', '.claude']) {
            const target = join(dir, root, 'skills', 'burger-api');
            await mkdir(target, { recursive: true });
            await writeFile(
                join(target, 'SKILL.md'),
                '---\ndescription: Build APIs with BurgerAPI\n---\n'
            );
        }

        const skills = listInstalledSkills(dir);

        expect(skills).toHaveLength(1);
        expect(skills[0]?.name).toBe('burger-api');
        expect(skills[0]?.description).toBe('Build APIs with BurgerAPI');
        expect(skills[0]?.locations).toEqual([
            '.agents/skills',
            '.claude/skills',
        ]);
    });

    it('lists a skill from .claude/skills/ alone', async () => {
        const dir = await tempProject('claude-only');
        const target = join(dir, '.claude', 'skills', 'solo');
        await mkdir(target, { recursive: true });
        await writeFile(join(target, 'SKILL.md'), '# no frontmatter');

        const skills = listInstalledSkills(dir);

        expect(skills).toHaveLength(1);
        expect(skills[0]?.name).toBe('solo');
        expect(skills[0]?.description).toBe('(no description)');
        expect(skills[0]?.locations).toEqual(['.claude/skills']);
    });

    it('ignores folders without a SKILL.md and files', async () => {
        const dir = await tempProject('ignore');
        await mkdir(join(dir, '.agents', 'skills', 'empty'), {
            recursive: true,
        });
        await mkdir(join(dir, '.agents', 'skills', 'burger-api'), {
            recursive: true,
        });
        await writeFile(
            join(dir, '.agents', 'skills', 'burger-api', 'SKILL.md'),
            '---\ndescription: Real\n---'
        );
        await writeFile(join(dir, '.agents', 'skills', 'not-a-folder'), 'x');

        const skills = listInstalledSkills(dir);

        expect(skills.map((s) => s.name)).toEqual(['burger-api']);
    });
});
