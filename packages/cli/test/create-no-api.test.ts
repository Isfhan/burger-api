/**
 * `create` must reject a project that would have nothing to serve. The success
 * cases run the command in-process with a fake `bun` on PATH so `bun install`
 * is a no-op (no network), and `--no-skills` avoids the skills download.
 */
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { delimiter, join } from 'path';
import { createCommand } from '../src/commands/create';
import {
    makeTempDir,
    removeDir,
    runCli,
    runCommandInProcess,
} from './test-utils';

const NOTHING_TO_SERVE =
    'Nothing to serve: --no-api needs --pages and/or --ws ' +
    '(a project must have API routes, pages or WebSocket routes).';

let dir = '';

beforeEach(() => {
    dir = makeTempDir('burger-create-no-api-');
});

afterEach(() => {
    if (dir) {
        removeDir(dir);
        dir = '';
    }
});

// The command instance is shared across test files; leave it at its defaults so
// later tests (e.g. create-prompt) see no flags from this file.
afterAll(() => {
    resetCreateOptions();
});

/** Commander reuses the command instance, so clear flag values between runs. */
function resetCreateOptions(): void {
    for (const option of createCommand.options) {
        createCommand.setOptionValue(option.attributeName(), option.defaultValue);
    }
}

/** A fake `bun` that succeeds, so create's install step never hits the network. */
function makeFakeBunBin(): string {
    const bin = join(dir, 'fake-bin');
    mkdirSync(bin, { recursive: true });
    if (process.platform === 'win32') {
        writeFileSync(join(bin, 'bun.cmd'), '@echo off\r\nexit /b 0\r\n');
    } else {
        writeFileSync(join(bin, 'bun'), '#!/bin/sh\nexit 0\n', {
            mode: 0o755,
        });
    }
    return bin;
}

/** Runs create in-process with the fake install shim on PATH. */
async function createInProcess(args: string[]) {
    resetCreateOptions();
    const originalPath = process.env.PATH;
    const bin = makeFakeBunBin();
    process.env.PATH = originalPath ? `${bin}${delimiter}${originalPath}` : bin;
    try {
        return await runCommandInProcess(createCommand, args, dir);
    } finally {
        if (originalPath === undefined) {
            delete process.env.PATH;
        } else {
            process.env.PATH = originalPath;
        }
    }
}

function indexFile(project: string): string {
    return readFileSync(join(dir, project, 'src', 'index.ts'), 'utf8');
}

describe('create --no-api with nothing else to serve', () => {
    it('rejects --no-api alone, writes nothing and exits 1', async () => {
        const result = await runCli(['create', 'demo', '--no-api'], {
            cwd: dir,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain(NOTHING_TO_SERVE);
        expect(existsSync(join(dir, 'demo'))).toBe(false);
    });

    it('rejects --no-api --yes, writes nothing and exits 1', async () => {
        const result = await runCli(
            ['create', 'demo', '--no-api', '--yes'],
            { cwd: dir }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain(NOTHING_TO_SERVE);
        expect(existsSync(join(dir, 'demo'))).toBe(false);
    });
});

describe('create --no-api with pages and/or WebSocket routes', () => {
    it('creates a pages-only project', async () => {
        const result = await createInProcess([
            'demo',
            '--no-api',
            '--pages',
            '--no-skills',
        ]);

        expect(result.exitCode).toBeNull();
        expect(existsSync(join(dir, 'demo', 'src', 'pages', 'index.html'))).toBe(
            true
        );
        expect(existsSync(join(dir, 'demo', 'src', 'api'))).toBe(false);

        const index = indexFile('demo');
        expect(index).toContain("pageDir: './src/pages',");
        expect(index).toContain("pagePrefix: '/',");
        expect(index).not.toContain('apiDir');
    });

    it('creates a WebSocket-only project', async () => {
        const result = await createInProcess([
            'demo',
            '--no-api',
            '--ws',
            '--no-skills',
        ]);

        expect(result.exitCode).toBeNull();
        expect(
            existsSync(join(dir, 'demo', 'src', 'websocket', 'echo'))
        ).toBe(true);
        expect(existsSync(join(dir, 'demo', 'src', 'api'))).toBe(false);
        expect(existsSync(join(dir, 'demo', 'src', 'pages'))).toBe(false);

        const index = indexFile('demo');
        expect(index).toContain("wsDir: './src/websocket',");
        expect(index).not.toContain('apiDir');
        expect(index).not.toContain('pageDir');
    });

    it('creates a pages and WebSocket project', async () => {
        const result = await createInProcess([
            'demo',
            '--no-api',
            '--pages',
            '--ws',
            '--no-skills',
        ]);

        expect(result.exitCode).toBeNull();
        expect(existsSync(join(dir, 'demo', 'src', 'pages', 'index.html'))).toBe(
            true
        );
        expect(
            existsSync(join(dir, 'demo', 'src', 'websocket', 'echo'))
        ).toBe(true);
        expect(existsSync(join(dir, 'demo', 'src', 'api'))).toBe(false);

        const index = indexFile('demo');
        expect(index).toContain("pageDir: './src/pages',");
        expect(index).toContain("wsDir: './src/websocket',");
        expect(index).not.toContain('apiDir');
    });
});
