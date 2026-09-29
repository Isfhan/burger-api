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
    makeTempDir,
    removeDir,
    runCommandInProcess,
    withMockedFetch,
} from './test-utils';

/** A fake skill as a flat map of repo-relative path -> content. */
interface FakeSkill {
    files: Record<string, string>;
}

/** Immediate children of `dir` for a flat file map (GitHub's contents API). */
function listEntries(
    files: Record<string, string>,
    dir: string
): Array<{ name: string; type: 'file' | 'dir' }> {
    const seen = new Map<string, 'file' | 'dir'>();
    for (const path of Object.keys(files)) {
        if (dir && !path.startsWith(`${dir}/`)) continue;
        const rest = dir ? path.slice(dir.length + 1) : path;
        const [head, ...tail] = rest.split('/');
        if (!head) continue;
        seen.set(head, tail.length > 0 ? 'dir' : 'file');
    }
    return [...seen.entries()].map(([name, type]) => ({ name, type }));
}

/**
 * Serves the GitHub endpoints a skill download uses from an in-memory skill.
 * `failRaw` can fail the raw download of a single file path.
 */
function skillGithubMock(
    skillName: string,
    skill: FakeSkill,
    failRaw?: (path: string) => boolean
): (input: string | URL | Request) => Response {
    const prefix = `ecosystem/skills/${skillName}`;
    const rawBase = 'https://raw.githubusercontent.com/isfhan/burger-api/x';
    return (input: string | URL | Request): Response => {
        const url = new URL(String(input));
        const contents = url.pathname.match(/\/contents\/(.+)$/);
        if (contents) {
            const repoPath = decodeURIComponent(contents[1]!);
            if (repoPath !== prefix && !repoPath.startsWith(`${prefix}/`)) {
                return new Response('not found', { status: 404 });
            }
            const dir =
                repoPath === prefix ? '' : repoPath.slice(prefix.length + 1);
            return Response.json(
                listEntries(skill.files, dir).map((entry) => ({
                    name: entry.name,
                    path: `${repoPath}/${entry.name}`,
                    type: entry.type,
                    ...(entry.type === 'file' && {
                        download_url: `${rawBase}/${repoPath}/${entry.name}`,
                    }),
                    size: 1,
                }))
            );
        }

        const raw = url.pathname.match(
            new RegExp(`/ecosystem/skills/${skillName}/(.+)$`)
        );
        if (raw) {
            const filePath = raw[1]!;
            if (failRaw?.(filePath)) {
                return new Response('server error', { status: 500 });
            }
            const content = skill.files[filePath];
            if (content === undefined) {
                return new Response('not found', { status: 404 });
            }
            return new Response(content);
        }

        return new Response(`unexpected URL: ${url.href}`, { status: 500 });
    };
}

const DEMO_SKILL: FakeSkill = {
    files: {
        'SKILL.md': '---\ndescription: Demo skill\n---\n\n# Demo',
        'references/routing.md': '# Routing',
        'references/nested/cli.md': '# CLI',
    },
};

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

            // Second install fails halfway through the file list.
            expect(
                withMockedFetch(
                    skillGithubMock('demo', DEMO_SKILL, (p) =>
                        p.endsWith('routing.md')
                    ),
                    () => installSkill('demo', { baseDir: dir })
                )
            ).rejects.toThrow('Failed to download skill "demo"');

            for (const root of [dirs.agents, dirs.claude]) {
                // Old install intact, no staging leftovers.
                expect(existsSync(join(root, 'demo', 'SKILL.md'))).toBe(true);
                expect(existsSync(join(root, 'demo.download'))).toBe(false);
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
