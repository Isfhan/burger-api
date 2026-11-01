/**
 * TTY prompt mock for `@clack/prompts`, shared by the interactive-command
 * tests. Bun 1.4 does not isolate `mock.module()` per test file (and
 * `mock.restore()` does not undo a module mock), so each file that needs
 * prompts calls {@link applyClackMock} before importing the command under
 * test and puts the real module back in `afterAll` via {@link restoreClack}.
 */
import { mock } from 'bun:test';
import * as realClack from '@clack/prompts';

/** Real exports captured before any mock is installed. */
const realExports = { ...realClack };

/** Sentinel standing in for clack's cancel symbol (Ctrl+C). */
export const CANCEL = Symbol('clack-cancel');

let answers: Array<boolean | typeof CANCEL> = [];
let messages: string[] = [];

/** Queue the answers the mocked `confirm` returns, in order. */
export function queueConfirmAnswers(
    ...values: Array<boolean | typeof CANCEL>
): void {
    answers.push(...values);
}

/** Messages passed to `confirm` since the last {@link resetPromptState}. */
export function confirmMessages(): string[] {
    return messages;
}

/** Clears queued answers and recorded messages. */
export function resetPromptState(): void {
    answers = [];
    messages = [];
}

/** Installs the mock; call before importing the command under test. */
export function applyClackMock(): void {
    mock.module('@clack/prompts', () => ({
        ...realExports,
        confirm: async (opts: { message: string }) => {
            messages.push(opts.message);
            const next = answers.shift();
            if (next === undefined) {
                // Fail loud instead of hanging on a real prompt.
                throw new Error(
                    `Unexpected prompt with no queued answer: ${opts.message}`
                );
            }
            return next;
        },
        isCancel: (value: unknown) =>
            value === CANCEL || realExports.isCancel(value),
    }));
}

/** Puts the real module back so later test files are unaffected. */
export function restoreClack(): void {
    mock.module('@clack/prompts', () => realExports);
}
