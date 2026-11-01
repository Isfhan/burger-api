/**
 * `burger-api create` without `--yes` in an interactive terminal. Mocks
 * `@clack/prompts`'s confirm (see `clack-mock.ts`) so the answer is
 * scripted; the full answer path would scaffold and run `bun install`, so
 * this covers the cancel path, which exits before any of that.
 */
import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import {
    applyClackMock,
    CANCEL,
    confirmMessages,
    queueConfirmAnswers,
    resetPromptState,
    restoreClack,
} from './clack-mock';
import { makeTempDir, removeDir, runCommandInProcess } from './test-utils';

applyClackMock();
const { createCommand } = await import('../src/commands/create');

afterAll(restoreClack);

let dir = '';

afterEach(() => {
    if (dir) {
        removeDir(dir);
        dir = '';
    }
});

describe('create command prompts (TTY)', () => {
    it(
        'asks interactively and exits 0 without scaffolding when cancelled',
        async () => {
            dir = makeTempDir('burger-create-prompt-');
            resetPromptState();
            queueConfirmAnswers(CANCEL);

            const result = await runCommandInProcess(
                createCommand,
                ['demo'],
                dir,
                { tty: true }
            );

            // onCancel calls process.exit(0) — the first exit call wins.
            expect(result.exitCode).toBe(0);
            expect(confirmMessages()).toContain('Do you need API routes?');
            expect(result.output).toContain('Operation cancelled');
            // Nothing was scaffolded and no `bun install` ran.
            expect(existsSync(join(dir, 'demo'))).toBe(false);
        }
    );
});
