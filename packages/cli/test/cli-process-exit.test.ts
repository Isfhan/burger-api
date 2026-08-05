/**
 * Regression: ephemeral CLI commands must exit without leaving orphaned handles
 * (e.g. per-request abort timers that outlive successful fetches).
 *
 * Network-dependent tests:
 *  - `burger-api ls`: set BURGER_API_CLI_LIST_EXIT_TEST=1
 *  - `burger-api skills available`: set BURGER_API_CLI_SKILLS_EXIT_TEST=1
 * when GitHub API is reachable (e.g. local dev) to assert full list paths.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'path';

const cliEntry = join(import.meta.dir, '..', 'src', 'index.ts');

async function runCli(args: string[]): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    elapsedMs: number;
}> {
    const start = performance.now();
    const proc = Bun.spawn(['bun', cliEntry, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: process.env,
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    return {
        exitCode,
        stdout,
        stderr,
        elapsedMs: performance.now() - start,
    };
}

describe('CLI process exit', () => {
    test('burger-api --version exits 0 with output under time bound', async () => {
        const { exitCode, stdout, stderr, elapsedMs } = await runCli([
            '--version',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout.trim().length).toBeGreaterThan(0);
        expect(stderr).toBe('');
        expect(elapsedMs).toBeLessThan(10_000);
    });

    test('burger-api list with invalid option exits non-zero quickly', async () => {
        const { exitCode, stderr, elapsedMs } = await runCli([
            'list',
            '--not-a-valid-option-for-list',
        ]);

        expect(exitCode).not.toBe(0);
        expect(stderr.toLowerCase()).toContain('unknown option');
        expect(elapsedMs).toBeLessThan(10_000);
    });

    test.skipIf(process.env.BURGER_API_CLI_LIST_EXIT_TEST !== '1')(
        'burger-api ls exits 0 with listing under time bound (requires GitHub)',
        async () => {
            const { exitCode, stdout, elapsedMs } = await runCli(['ls']);

            expect(exitCode).toBe(0);
            expect(stdout).toContain('Available Hooks and Plugins');
            expect(elapsedMs).toBeLessThan(18_000);
        }
    );

    test.skipIf(process.env.BURGER_API_CLI_SKILLS_EXIT_TEST !== '1')(
        'burger-api skills available exits 0 with listing under time bound (requires GitHub)',
        async () => {
            const { exitCode, stdout, elapsedMs } = await runCli([
                'skills',
                'available',
            ]);

            expect(exitCode).toBe(0);
            expect(stdout).toContain('burger-api');
            expect(elapsedMs).toBeLessThan(18_000);
        }
    );

    test('burger-api skills exits 0 under time bound', async () => {
        const { exitCode, elapsedMs } = await runCli(['skills', '--help']);

        expect(exitCode).toBe(0);
        expect(elapsedMs).toBeLessThan(10_000);
    });

    test('burger-api skills install exits 0 under time bound', async () => {
        const { exitCode, elapsedMs } = await runCli([
            'skills',
            'install',
            '--help',
        ]);

        expect(exitCode).toBe(0);
        expect(elapsedMs).toBeLessThan(10_000);
    });
});
