/**
 * `burger-api add` in an interactive terminal: the "already exists —
 * overwrite?" confirm. `@clack/prompts` is mocked (see `clack-mock.ts`), so
 * this file stays separate from the non-interactive add tests and restores
 * the real module after itself.
 */
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
    applyClackMock,
    CANCEL,
    confirmMessages,
    queueConfirmAnswers,
    resetPromptState,
    restoreClack,
} from './clack-mock';
import { githubMock, type FakeRepo } from './github-mocks';
import {
    makeTempDir,
    removeDir,
    runCommandInProcess,
    withMockedFetch,
} from './test-utils';

applyClackMock();
const { addCommand } = await import('../src/commands/add');

afterAll(restoreClack);

const NEW_CORS = 'export function cors() { return "v2"; }\n';
const OLD_CORS = '// local edit v1\n';

const REPO: FakeRepo = {
    hooks: {
        cors: {
            files: {
                'cors.ts': NEW_CORS,
                'README.md': '# cors v2\n',
            },
        },
    },
    plugins: {},
};

/** Counts raw.githubusercontent.com downloads while serving `repo`. */
function countingGithubMock(
    repo: FakeRepo,
    counter: { raw: number }
): (input: string | URL | Request) => Response {
    const serve = githubMock(repo);
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
    dir = makeTempDir('burger-add-prompt-');
    await Bun.write(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'add-prompt-test', version: '0.0.0' })
    );
    const existing = join(dir, 'ecosystem', 'hooks', 'cors');
    await Bun.write(join(existing, 'cors.ts'), OLD_CORS);
    await Bun.write(join(existing, 'stale.ts'), '// stale file\n');
});

afterEach(() => {
    removeDir(dir);
});

describe('add command overwrite prompt (TTY)', () => {
    it('replaces the existing install when the user confirms', async () => {
        queueConfirmAnswers(true);

        const result = await withMockedFetch(
            countingGithubMock(REPO, counter),
            () =>
                runCommandInProcess(addCommand, ['cors'], dir, { tty: true })
        );

        const target = join(dir, 'ecosystem', 'hooks', 'cors');
        expect(result.exitCode).toBeNull();
        expect(confirmMessages()).toEqual(['cors already exists. Overwrite?']);
        expect(counter.raw).toBeGreaterThan(0);
        expect(readFileSync(join(target, 'cors.ts'), 'utf8')).toBe(NEW_CORS);
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe(
            '# cors v2\n'
        );
        // The replaced install is fully swapped, not merged.
        expect(existsSync(join(target, 'stale.ts'))).toBe(false);
        expect(result.output).toContain('Added cors');
        expect(result.output).toContain('Packages added successfully!');
    });

    it(
        'keeps the existing install and downloads nothing when declined',
        async () => {
            queueConfirmAnswers(false);

            const result = await withMockedFetch(
                countingGithubMock(REPO, counter),
                () =>
                    runCommandInProcess(addCommand, ['cors'], dir, {
                        tty: true,
                    })
            );

            const target = join(dir, 'ecosystem', 'hooks', 'cors');
            expect(result.exitCode).toBeNull();
            expect(confirmMessages()).toEqual([
                'cors already exists. Overwrite?',
            ]);
            expect(counter.raw).toBe(0);
            expect(readFileSync(join(target, 'cors.ts'), 'utf8')).toBe(
                OLD_CORS
            );
            expect(existsSync(join(target, 'stale.ts'))).toBe(true);
            expect(result.output).toContain('Skipped cors');
            expect(result.output).toContain('No packages were added');
        }
    );

    it(
        'treats a cancelled prompt as a skip (exit 0) and touches nothing',
        async () => {
            queueConfirmAnswers(CANCEL);

            const result = await withMockedFetch(
                countingGithubMock(REPO, counter),
                () =>
                    runCommandInProcess(addCommand, ['cors'], dir, {
                        tty: true,
                    })
            );

            const target = join(dir, 'ecosystem', 'hooks', 'cors');
            expect(result.exitCode).toBeNull();
            expect(confirmMessages()).toEqual([
                'cors already exists. Overwrite?',
            ]);
            expect(counter.raw).toBe(0);
            expect(readFileSync(join(target, 'cors.ts'), 'utf8')).toBe(
                OLD_CORS
            );
            expect(result.output).toContain('Skipped cors');
        }
    );
});
