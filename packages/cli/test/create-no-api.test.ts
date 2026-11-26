/**
 * `create` must reject a project that would have nothing to serve. The success
 * cases run the command in-process with `installDependencies` stubbed out so
 * `bun install` never runs against the network, and `--no-skills` avoids the
 * skills download.
 */
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    spyOn,
} from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createCommand } from '../src/commands/create';
import * as templates from '../src/utils/templates';
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
let installSpy: ReturnType<typeof stubInstall> | undefined;

beforeEach(() => {
    dir = makeTempDir('burger-create-no-api-');
});

afterEach(() => {
    if (installSpy) {
        installSpy.mockRestore();
        installSpy = undefined;
    }
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

/** Stubs the real `bun install` step; restored in afterEach. */
function stubInstall() {
    return spyOn(templates, 'installDependencies').mockResolvedValue(undefined);
}

/** Runs create in-process with dependency installation stubbed out. */
async function createInProcess(args: string[]) {
    resetCreateOptions();
    installSpy = stubInstall();
    return await runCommandInProcess(createCommand, args, dir);
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
        expect(installSpy).toHaveBeenCalledTimes(1);
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
        expect(installSpy).toHaveBeenCalledTimes(1);
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
        expect(installSpy).toHaveBeenCalledTimes(1);
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
