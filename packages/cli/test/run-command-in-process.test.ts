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
});
