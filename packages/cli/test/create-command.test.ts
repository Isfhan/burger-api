/**
 * `burger-api create` validation paths that exit before scaffolding (and its
 * `bun install`), so they run offline. The success/rollback paths live in
 * `e2e/create-e2e.test.ts` because create always installs dependencies.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import { makeTempDir, removeDir, runCli } from './test-utils';

let dir = '';

beforeEach(() => {
    dir = makeTempDir('burger-create-cli-');
});

afterEach(() => {
    removeDir(dir);
});

describe('create command — validation before scaffolding', () => {
    it('rejects an unknown --lang and writes nothing', async () => {
        const result = await runCli(['create', 'demo', '--lang', 'py'], {
            cwd: dir,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain(
            '--lang must be "ts" or "js" (got "py")'
        );
        expect(existsSync(join(dir, 'demo'))).toBe(false);
    });

    it('refuses an existing directory and leaves it untouched', async () => {
        const existing = join(dir, 'demo');
        await Bun.write(join(existing, 'sentinel.txt'), 'mine\n');

        const result = await runCli(['create', 'demo', '--yes'], { cwd: dir });

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain(
            'A directory named "demo" already exists'
        );
        expect(await Bun.file(join(existing, 'sentinel.txt')).text()).toBe(
            'mine\n'
        );
        expect(existsSync(join(existing, 'package.json'))).toBe(false);
    });

    it('rejects an --api-dir that escapes src/', async () => {
        const result = await runCli(
            ['create', 'demo', '--yes', '--api-dir', '../x'],
            { cwd: dir }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain(
            "API directory cannot be empty or contain '..'"
        );
        expect(existsSync(join(dir, 'demo'))).toBe(false);
        expect(existsSync(join(dir, 'x'))).toBe(false);
    });

    it('rejects an invalid project name', async () => {
        const result = await runCli(['create', 'bad name', '--yes'], {
            cwd: dir,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('Project name cannot contain spaces');
        expect(existsSync(join(dir, 'bad name'))).toBe(false);
    });
});
