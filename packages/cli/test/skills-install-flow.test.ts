/**
 * Skills install flow: the real downloader/copier against a mocked GitHub,
 * plus the `skills install` command action run in-process.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { skillsCommand } from '../src/commands/skills';
import { installSkill, skillDirs } from '../src/utils/skills';
import {
    DEMO_SKILL,
    skillGithubMock,
    type FakeSkill,
} from './github-mocks';
import {
    makeTempDir,
    removeDir,
    runCommandInProcess,
    withMockedFetch,
} from './test-utils';

let dir = '';

beforeEach(async () => {
    dir = makeTempDir('burger-skills-flow-');
    await Bun.write(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'skills-test', version: '0.0.0' })
    );
});

afterEach(() => {
    removeDir(dir);
});

describe('skills install helpers (real downloader)', () => {
    it('downloads once and installs into both skill folders', async () => {
        const result = await withMockedFetch(
            skillGithubMock('demo', DEMO_SKILL),
            () =>
                installSkill('demo', {
                    baseDir: dir,
                })
        );

        expect(result).toBe(3);
        const dirs = skillDirs(dir);
        for (const root of [dirs.agents, dirs.claude]) {
            const target = join(root, 'demo');
            expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toContain(
                'Demo skill'
            );
            expect(
                readFileSync(join(target, 'references', 'routing.md'), 'utf8')
            ).toBe('# Routing');
            expect(
                readFileSync(
                    join(target, 'references', 'nested', 'cli.md'),
                    'utf8'
                )
            ).toBe('# CLI');
        }
    });

    it('reinstalling replaces stale files in both folders', async () => {
        await withMockedFetch(skillGithubMock('demo', DEMO_SKILL), () =>
            installSkill('demo', { baseDir: dir })
        );
        const dirs = skillDirs(dir);
        for (const root of [dirs.agents, dirs.claude]) {
            await Bun.write(join(root, 'demo', 'stale.md'), '# stale');
        }

        await withMockedFetch(skillGithubMock('demo', DEMO_SKILL), () =>
            installSkill('demo', { baseDir: dir })
        );

        for (const root of [dirs.agents, dirs.claude]) {
            expect(existsSync(join(root, 'demo', 'stale.md'))).toBe(false);
            expect(existsSync(join(root, 'demo', 'SKILL.md'))).toBe(true);
        }
    });

    it(
        'a failed download keeps the old install and no partial files',
        async () => {
            // First install succeeds.
            await withMockedFetch(skillGithubMock('demo', DEMO_SKILL), () =>
                installSkill('demo', { baseDir: dir })
            );
            const dirs = skillDirs(dir);

            // Second install fails halfway through the file list, after
            // SKILL.md already downloaded to staging.
            const updated: FakeSkill = {
                files: {
                    'SKILL.md': '---\ndescription: Demo v2\n---\n\n# Demo',
                    'references/routing.md': '# Routing v2',
                    'references/nested/cli.md': '# CLI v2',
                },
            };
            await expect(
                withMockedFetch(
                    skillGithubMock('demo', updated, (p) =>
                        p.endsWith('routing.md')
                    ),
                    () => installSkill('demo', { baseDir: dir })
                )
            ).rejects.toThrow('Failed to download skill "demo"');

            for (const root of [dirs.agents, dirs.claude]) {
                // Old install intact — including the old routing.md content,
                // not the version the failed download staged.
                expect(
                    readFileSync(join(root, 'demo', 'SKILL.md'), 'utf8')
                ).toContain('Demo skill');
                expect(
                    readFileSync(
                        join(root, 'demo', 'references', 'routing.md'),
                        'utf8'
                    )
                ).toBe('# Routing');
                expect(existsSync(join(root, 'demo.download'))).toBe(false);
                expect(
                    existsSync(
                        join(root, 'demo', 'references', 'nested', 'cli.md')
                    )
                ).toBe(true);
            }
        }
    );
});

describe('skills install command (mocked GitHub, non-TTY)', () => {
    it('installs a skill into .agents/skills and .claude/skills', async () => {
        const result = await withMockedFetch(
            skillGithubMock('demo', DEMO_SKILL),
            () => runCommandInProcess(skillsCommand, ['install', 'demo'], dir)
        );

        expect(result.exitCode).toBeNull();
        expect(result.output).toContain('installed successfully');
        expect(result.output).toContain('.agents/skills/demo/SKILL.md');
        const dirs = skillDirs(dir);
        expect(existsSync(join(dirs.agents, 'demo', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(dirs.claude, 'demo', 'SKILL.md'))).toBe(true);
    });

    it('refuses to overwrite without a terminal', async () => {
        const installed = join(dir, '.agents', 'skills', 'demo');
        await Bun.write(join(installed, 'SKILL.md'), '# mine');

        const result = await withMockedFetch(
            skillGithubMock('demo', DEMO_SKILL),
            () => runCommandInProcess(skillsCommand, ['install', 'demo'], dir)
        );

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain(
            'demo is already installed in .agents/skills/ or .claude/skills/'
        );
        expect(readFileSync(join(installed, 'SKILL.md'), 'utf8')).toBe(
            '# mine'
        );
        expect(existsSync(join(dir, '.claude', 'skills', 'demo'))).toBe(false);
    });

    it(
        'a skill missing on GitHub exits non-zero and writes nothing',
        async () => {
            const result = await withMockedFetch(
                skillGithubMock('demo', DEMO_SKILL),
                () =>
                    runCommandInProcess(
                        skillsCommand,
                        ['install', 'missing'],
                        dir
                    )
            );

            expect(result.exitCode).toBe(1);
            expect(result.output).toContain('"missing" not found on GitHub');
            const agentsMissing = join(dir, '.agents', 'skills', 'missing');
            const claudeMissing = join(dir, '.claude', 'skills', 'missing');
            expect(existsSync(agentsMissing)).toBe(false);
            expect(existsSync(claudeMissing)).toBe(false);
        }
    );
});
