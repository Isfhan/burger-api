/**
 * `burger-api start` action via the real CLI: port validation, missing
 * entry hints, the stale-bundle warning, and child exit-code propagation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { utimesSync } from 'fs';
import { join } from 'path';
import {
    getAvailablePort,
    makeTempDir,
    removeDir,
    runCli,
} from './test-utils';

let dir = '';

beforeEach(() => {
    dir = makeTempDir('burger-start-cli-');
});

afterEach(() => {
    removeDir(dir);
});

describe('start command', () => {
    it('rejects an invalid --port with exit code 2', async () => {
        const result = await runCli(['start', '--port', 'not-a-port'], {
            cwd: dir,
        });

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toContain('Invalid port "not-a-port"');
    });

    it('rejects an invalid $PORT with exit code 2', async () => {
        const result = await runCli(['start'], {
            cwd: dir,
            env: { PORT: '0' },
        });

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toContain('(from $PORT)');
    });

    it('hints to build first when the bundle is missing', async () => {
        const result = await runCli(
            ['start', '--file', '.build/bundle/app.js'],
            { cwd: dir }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain(
            'Entry file not found: .build/bundle/app.js'
        );
        expect(result.stdout).toContain('Run "burger-api build" first');
    });

    it('warns when the bundle is stale and propagates exit 0', async () => {
        const bundle = join(dir, '.build', 'bundle', 'app.js');
        await Bun.write(bundle, "console.log('fake-bundle-booted');\n");
        const past = Date.now() / 1000 - 3600;
        utimesSync(bundle, past, past);
        await Bun.write(
            join(dir, 'src', 'api', 'hello', 'route.ts'),
            'export const GET = () => new Response("ok");\n'
        );

        const port = await getAvailablePort();
        const result = await runCli(['start', '--port', String(port)], {
            cwd: dir,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('fake-bundle-booted');
        expect(result.stdout).toContain(
            'The build is older than your source files'
        );
    });

    it('propagates the child exit code', async () => {
        await Bun.write(
            join(dir, '.build', 'bundle', 'app.js'),
            'process.exit(3);\n'
        );

        const port = await getAvailablePort();
        const result = await runCli(['start', '--port', String(port)], {
            cwd: dir,
        });

        expect(result.exitCode).toBe(3);
        expect(result.stdout).toContain('Server stopped unexpectedly');
    });
});
