/**
 * Runs the full repo test suite with buffered output and prints a compact summary.
 * Usage: bun run scripts/test-summary.ts (from repository root)
 */
import { join } from 'path';

const repoRoot = join(import.meta.dir, '..');

type Suite =
    | {
          label: string;
          cmd: string[];
          kind: 'tests';
      }
    | {
          label: string;
          cmd: string[];
          kind: 'typecheck';
      };

const suites: Suite[] = [
    {
        label: 'route-sync',
        cmd: ['bun', 'test', 'test/route-sync.test.ts'],
        kind: 'tests',
    },
    {
        label: 'router',
        cmd: ['bun', 'test', 'test/router-phase1.test.ts'],
        kind: 'tests',
    },
    {
        label: 'framework',
        cmd: ['bun', 'run', '--filter', 'burger-api', 'test:examples'],
        kind: 'tests',
    },
    {
        label: 'ecosystem',
        cmd: ['bun', 'run', '--filter', 'burger-api', 'test:ecosystem'],
        kind: 'tests',
    },
    {
        label: 'cli',
        cmd: ['bun', 'run', '--filter', '@burger-api/cli', 'test'],
        kind: 'tests',
    },
    {
        label: 'typecheck',
        cmd: ['bun', 'run', '--filter', 'burger-api', 'typecheck'],
        kind: 'typecheck',
    },
];

function parseTestCounts(output: string): { pass: number; fail: number } | null {
    const passMatches = [...output.matchAll(/(\d+)\s+pass\b/gi)];
    const failMatches = [...output.matchAll(/(\d+)\s+fail\b/gi)];
    if (passMatches.length === 0) {
        return null;
    }
    const pass = Number(passMatches[passMatches.length - 1][1]);
    const fail =
        failMatches.length > 0
            ? Number(failMatches[failMatches.length - 1][1])
            : 0;
    return { pass, fail };
}

function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
}

async function runCommand(cmd: string[]): Promise<{
    exitCode: number | null;
    output: string;
    durationMs: number;
}> {
    const start = performance.now();
    const subprocess = Bun.spawn(cmd, {
        cwd: repoRoot,
        stdout: 'pipe',
        stderr: 'pipe',
        env: process.env,
    });

    const [out, err] = await Promise.all([
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
    ]);
    const exitCode = await subprocess.exited;
    const durationMs = performance.now() - start;
    const output = out + (err ? `\n${err}` : '');
    return { exitCode, output, durationMs };
}

function padLabel(s: string, width: number): string {
    return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

async function main(): Promise<void> {
    const results: {
        label: string;
        kind: 'tests' | 'typecheck';
        pass?: number;
        fail?: number;
        exitCode: number | null;
        output: string;
        durationMs: number;
        parseFailed?: boolean;
    }[] = [];

    for (const suite of suites) {
        const { exitCode, output, durationMs } = await runCommand(suite.cmd);

        if (suite.kind === 'typecheck') {
            results.push({
                label: suite.label,
                kind: 'typecheck',
                exitCode,
                output,
                durationMs,
            });
            continue;
        }

        const parsed = parseTestCounts(output);
        const parseFailed = parsed === null && exitCode === 0;
        results.push({
            label: suite.label,
            kind: 'tests',
            pass: parsed?.pass,
            fail: parsed?.fail,
            exitCode,
            output,
            durationMs,
            parseFailed,
        });
    }

    const labelW = 12;
    const failedSuites = results.filter((r) => {
        if (r.kind === 'typecheck') {
            return r.exitCode !== 0;
        }
        if (r.exitCode !== 0) return true;
        if (typeof r.fail === 'number' && r.fail > 0) return true;
        return r.parseFailed === true;
    });

    let lines: string[] = [];
    lines.push('');
    lines.push('BurgerAPI — full test suite');
    lines.push('─'.repeat(56));

    let totalPass = 0;
    let totalFail = 0;
    let totalMs = 0;

    for (const r of results) {
        totalMs += r.durationMs;
        const dur = formatDuration(r.durationMs);

        if (r.kind === 'typecheck') {
            const ok = r.exitCode === 0;
            lines.push(
                `  ${padLabel(r.label, labelW)}  ${ok ? 'OK' : 'FAIL'}`.padEnd(
                    28
                ) + `  ${dur}`
            );
            continue;
        }

        if (r.parseFailed || (typeof r.pass !== 'number' && r.exitCode === 0)) {
            lines.push(
                `  ${padLabel(r.label, labelW)}  (could not parse summary)  ${dur}`
            );
        } else if (typeof r.pass === 'number') {
            const fail = typeof r.fail === 'number' ? r.fail : 0;
            totalPass += r.pass;
            totalFail += fail;
            lines.push(
                `  ${padLabel(r.label, labelW)}  ${String(r.pass).padStart(4)} pass   ${String(fail).padStart(2)} fail     ${dur}`
            );
        } else {
            lines.push(
                `  ${padLabel(r.label, labelW)}  (no summary)  exit ${r.exitCode}  ${dur}`
            );
        }
    }

    lines.push('─'.repeat(56));

    const status = failedSuites.length === 0 ? 'ALL PASS' : 'SOME FAILED';
    lines.push(
        `  ${padLabel('Total', labelW)}  ${String(totalPass).padStart(4)} pass   ${String(totalFail).padStart(2)} fail     ${formatDuration(totalMs)}   ${status}`
    );
    lines.push('');

    process.stdout.write(lines.join('\n'));

    if (failedSuites.length > 0) {
        process.stdout.write('\n--- Failure details ---\n\n');
        for (const r of failedSuites) {
            process.stdout.write(`>>> ${r.label}\n`);
            process.stdout.write(r.output);
            if (!r.output.endsWith('\n')) process.stdout.write('\n');
            process.stdout.write('\n');
        }
    }

    process.exit(failedSuites.length > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
