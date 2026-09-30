/**
 * runCommandInProcess: exit codes are reported even when a command action
 * catches its own ProcessExitError.
 */
import { describe, expect, it } from 'bun:test';
import { Command } from 'commander';
import { makeTempDir, removeDir, runCommandInProcess } from './test-utils';

describe('runCommandInProcess', () => {
    it('reports null for an action that just returns', async () => {
        const cmd = new Command('noop').action(() => {});
        const dir = makeTempDir('burger-inproc-');
        try {
            const result = await runCommandInProcess(cmd, [], dir);
            expect(result.exitCode).toBeNull();
        } finally {
            removeDir(dir);
        }
    });

    it('reports the exit code when an action swallows the error', async () => {
        const cmd = new Command('swallow').action(() => {
            try {
                process.exit(7);
            } catch {
                // A command action could swallow the mock's throw.
            }
            console.log('after swallow');
        });
        const dir = makeTempDir('burger-inproc-');
        try {
            const result = await runCommandInProcess(cmd, [], dir);
            expect(result.exitCode).toBe(7);
            expect(result.output).toContain('after swallow');
        } finally {
            removeDir(dir);
        }
    });

    it('keeps the first exit code when a catch block exits again', async () => {
        const cmd = new Command('nested').action(() => {
            try {
                process.exit(0);
            } catch {
                // Unreachable against a real process.exit — but this helper
                // throws, so an action's catch block may run and exit again.
                process.exit(1);
            }
        });
        const dir = makeTempDir('burger-inproc-');
        try {
            const result = await runCommandInProcess(cmd, [], dir);
            expect(result.exitCode).toBe(0);
        } finally {
            removeDir(dir);
        }
    });

    it('forces stdin to a TTY only with the tty option', async () => {
        let plain = false;
        let tty = false;
        const dir = makeTempDir('burger-inproc-');
        try {
            await runCommandInProcess(
                new Command('notty').action(() => {
                    plain = Boolean(process.stdin.isTTY);
                }),
                [],
                dir
            );
            await runCommandInProcess(
                new Command('tty').action(() => {
                    tty = Boolean(process.stdin.isTTY);
                }),
                [],
                dir,
                { tty: true }
            );
            expect(plain).toBe(false);
            expect(tty).toBe(true);
        } finally {
            removeDir(dir);
        }
    });
});
