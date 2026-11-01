/**
 * Interactive prompts in a real Windows console.
 *
 * The other prompt tests fake the TTY, so they cannot catch a prompt that
 * crashes when it writes to a real console (EPIPE with @clack/prompts 0.7 on
 * Bun for Windows). This opens a minimized console window, runs `create`
 * there and checks it is still waiting at the first prompt.
 */
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { makeTempDir, removeDir } from '../test-utils';

const CLI_ENTRY = join(import.meta.dir, '..', '..', 'src', 'index.ts');

describe.skipIf(process.platform !== 'win32')('real console (Windows)', () => {
    test('create waits at the first prompt instead of crashing', () => {
        const dir = makeTempDir('burger-console-');
        try {
            const log = join(dir, 'run.log');
            const harness = join(dir, 'harness.ts');
            // Records the TTY state and any crash, since the console window's
            // own output cannot be captured.
            writeFileSync(
                harness,
                [
                    "import { appendFileSync } from 'fs';",
                    `const log = (s: string) => appendFileSync(${JSON.stringify(log)}, s + '\\n');`,
                    "log('tty ' + Boolean(process.stdin.isTTY && process.stdout.isTTY));",
                    "process.on('uncaughtException', (e) => { log('CRASH ' + e); process.exit(9); });",
                    "process.on('unhandledRejection', (e) => { log('CRASH ' + e); process.exit(9); });",
                    "setTimeout(() => log('WAITING'), 3000);",
                    "process.argv = [process.argv[0]!, 'cli', 'create', 'console-app'];",
                    `await import(${JSON.stringify(CLI_ENTRY)});`,
                ].join('\n')
            );

            const script = [
                `$p = Start-Process -FilePath '${process.execPath}' -ArgumentList '"${harness}"' -WorkingDirectory '${dir}' -PassThru -WindowStyle Minimized`,
                'Start-Sleep -Seconds 5',
                'if (!$p.HasExited) { Stop-Process -Id $p.Id -Force }',
            ].join('; ');
            spawnSync('powershell', ['-NoProfile', '-Command', script], {
                stdio: 'ignore',
                timeout: 30_000,
            });

            const out = existsSync(log) ? readFileSync(log, 'utf-8') : '';
            expect(out).toContain('tty true');
            expect(out).not.toContain('CRASH');
            expect(out).toContain('WAITING');
            expect(existsSync(join(dir, 'console-app'))).toBe(false);
        } finally {
            removeDir(dir);
        }
    }, 45_000);
});
