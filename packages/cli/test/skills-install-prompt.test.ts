/**
 * `burger-api skills install` in an interactive terminal: the "already
 * installed — overwrite?" confirm. `@clack/prompts` is mocked (see
 * `clack-mock.ts`), so this file stays separate from the non-interactive
 * skills tests and restores the real module after itself.
 */
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
    applyClackMock,
    CANCEL,
    confirmMessages,
    queueConfirmAnswers,
    resetPromptState,
    restoreClack,
} from './clack-mock';
import { skillGithubMock, type FakeSkill } from './github-mocks';
import { installSkill, skillDirs } from '../src/utils/skills';
import {
    makeTempDir,
    removeDir,
    runCommandInProcess,
    withMockedFetch,
} from './test-utils';

applyClackMock();
const { skillsCommand } = await import('../src/commands/skills');

afterAll(restoreClack);

const V1: FakeSkill = {
    files: {
        'SKILL.md': '---\ndescription: Demo v1\n---\n',
        'references/routing.md': '# Routing v1',
    },
};
const V2: FakeSkill = {
    files: {
        'SKILL.md': '---\ndescription: Demo v2\n---\n',
        'references/routing.md': '# Routing v2',
    },
};

/** Counts raw.githubusercontent.com downloads while serving `skill`. */
function countingSkillMock(
    skill: FakeSkill,
    counter: { raw: number }
): (input: string | URL | Request) => Response {
    const serve = skillGithubMock('demo', skill);
    return (input: string | URL | Request): Response => {
        if (String(input).includes('raw.githubusercontent.com')) counter.raw++;
        return serve(input);
    };
}

let dir = '';
let counter = { raw: 0 };

beforeEach(async () => {
    resetPromptState();
    counter = { raw: 0 };
    dir = makeTempDir('burger-skills-prompt-');
    await Bun.write(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'skills-prompt-test', version: '0.0.0' })
    );
    // A real v1 install in both folders, ready to be overwritten.
    await withMockedFetch(skillGithubMock('demo', V1), () =>
        installSkill('demo', { baseDir: dir })
    );
});

afterEach(() => {
    removeDir(dir);
});

describe('skills install overwrite prompt (TTY)', () => {
    it('replaces both installed copies when the user confirms', async () => {
        queueConfirmAnswers(true);

        const result = await withMockedFetch(
            countingSkillMock(V2, counter),
            () =>
                runCommandInProcess(
                    skillsCommand,
                    ['install', 'demo'],
                    dir,
                    { tty: true }
                )
        );

        expect(result.exitCode).toBeNull();
        expect(confirmMessages()).toEqual([
            'demo already exists. Overwrite?',
        ]);
        expect(counter.raw).toBeGreaterThan(0);
        const dirs = skillDirs(dir);
        for (const root of [dirs.agents, dirs.claude]) {
            expect(
                readFileSync(join(root, 'demo', 'SKILL.md'), 'utf8')
            ).toContain('Demo v2');
            expect(
                readFileSync(
                    join(root, 'demo', 'references', 'routing.md'),
                    'utf8'
                )
            ).toBe('# Routing v2');
        }
        expect(result.output).toContain('Installed demo');
        expect(result.output).toContain('installed successfully');
    });

    it('keeps both copies and downloads nothing when declined', async () => {
        queueConfirmAnswers(false);

        const result = await withMockedFetch(
            countingSkillMock(V2, counter),
            () =>
                runCommandInProcess(
                    skillsCommand,
                    ['install', 'demo'],
                    dir,
                    { tty: true }
                )
        );

        expect(result.exitCode).toBe(0);
        expect(confirmMessages()).toEqual([
            'demo already exists. Overwrite?',
        ]);
        expect(counter.raw).toBe(0);
        const dirs = skillDirs(dir);
        for (const root of [dirs.agents, dirs.claude]) {
            expect(
                readFileSync(join(root, 'demo', 'SKILL.md'), 'utf8')
            ).toContain('Demo v1');
        }
        expect(result.output).toContain('Skipped demo');
    });

    it('exits 0 and touches nothing when the prompt is cancelled', async () => {
        queueConfirmAnswers(CANCEL);

        const result = await withMockedFetch(
            countingSkillMock(V2, counter),
            () =>
                runCommandInProcess(
                    skillsCommand,
                    ['install', 'demo'],
                    dir,
                    { tty: true }
                )
        );

        expect(result.exitCode).toBe(0);
        expect(confirmMessages()).toEqual([
            'demo already exists. Overwrite?',
        ]);
        expect(counter.raw).toBe(0);
        const dirs = skillDirs(dir);
        for (const root of [dirs.agents, dirs.claude]) {
            expect(
                readFileSync(join(root, 'demo', 'SKILL.md'), 'utf8')
            ).toContain('Demo v1');
        }
        expect(result.output).toContain('Skipped demo');
    });
});
