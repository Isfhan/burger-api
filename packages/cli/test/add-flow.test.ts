/**
 * `burger-api add` real flow, offline: the GitHub calls are mocked and the
 * command action runs in-process in a temp project.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { addCommand } from '../src/commands/add';
import { githubMock, type FakeRepo } from './github-mocks';
import {
    makeTempDir,
    removeDir,
    runCommandInProcess,
    withMockedFetch,
} from './test-utils';

let dir = '';

beforeEach(async () => {
    dir = makeTempDir('burger-add-');
    await Bun.write(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'add-test', version: '0.0.0' })
    );
});

afterEach(() => {
    removeDir(dir);
});

describe('add command flow', () => {
    it('installs a hook into ecosystem/hooks/ with every file', async () => {
        const repo: FakeRepo = {
            hooks: {
                cors: {
                    files: {
                        'cors.ts': 'export function cors() {}\n',
                        'README.md': '# cors\n',
                    },
                },
            },
            plugins: {},
        };

        const result = await withMockedFetch(githubMock(repo), () =>
            runCommandInProcess(addCommand, ['cors'], dir)
        );

        const target = join(dir, 'ecosystem', 'hooks', 'cors');
        expect(result.exitCode).toBeNull();
        expect(readFileSync(join(target, 'cors.ts'), 'utf8')).toBe(
            'export function cors() {}\n'
        );
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe(
            '# cors\n'
        );
        // The .gitkeep placeholder used while creating the dir is removed.
        expect(existsSync(join(target, '.gitkeep'))).toBe(false);
        expect(result.output).toContain('Added cors');
        expect(result.output).toContain('Successfully added 1 package(s)');
        expect(result.output).toContain('export const onRequest = [');
    });

    it(
        'installs a plugin under ecosystem/plugins/ (hooks checked first)',
        async () => {
            const repo: FakeRepo = {
                hooks: {},
                plugins: {
                    'jwt-auth': {
                        files: {
                            'jwt-auth.ts': 'export function jwtAuth() {}\n',
                        },
                    },
                },
            };

            const result = await withMockedFetch(githubMock(repo), () =>
                runCommandInProcess(addCommand, ['jwt-auth'], dir)
            );

            expect(result.exitCode).toBeNull();
            expect(
                existsSync(
                    join(
                        dir,
                        'ecosystem',
                        'plugins',
                        'jwt-auth',
                        'jwt-auth.ts'
                    )
                )
            ).toBe(true);
            expect(result.output).toContain('burger.usePlugin(');
            expect(result.output).toContain(
                "from '../ecosystem/plugins/jwt-auth/jwt-auth'"
            );
        }
    );

    it('skips an existing install without downloading it', async () => {
        const repo: FakeRepo = {
            hooks: {
                cors: { files: { 'cors.ts': 'export function cors() {}\n' } },
            },
            plugins: {},
        };
        const existing = join(dir, 'ecosystem', 'hooks', 'cors');
        await Bun.write(join(existing, 'cors.ts'), '// local edit\n');

        let rawDownloads = 0;
        const result = await withMockedFetch(
            (input) => {
                if (String(input).includes('raw.githubusercontent.com')) {
                    rawDownloads++;
                }
                return githubMock(repo)(input);
            },
            () => runCommandInProcess(addCommand, ['cors'], dir)
        );

        expect(result.exitCode).toBeNull();
        expect(result.output).toContain('already exists — skipped');
        expect(rawDownloads).toBe(0);
        expect(readFileSync(join(existing, 'cors.ts'), 'utf8')).toBe(
            '// local edit\n'
        );
    });

    it('reports an unknown package name and writes nothing', async () => {
        const repo: FakeRepo = { hooks: {}, plugins: {} };

        const result = await withMockedFetch(githubMock(repo), () =>
            runCommandInProcess(addCommand, ['not-a-package'], dir)
        );

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain('Package "not-a-package" not found');
        expect(existsSync(join(dir, 'ecosystem'))).toBe(false);
    });

    it('reports a download failure and writes nothing', async () => {
        const repo: FakeRepo = {
            hooks: {
                flaky: {
                    files: { 'flaky.ts': 'export function flaky() {}\n' },
                },
            },
            plugins: {},
        };

        const result = await withMockedFetch(
            githubMock(repo, {
                // First hit is detection; the download's contents call fails.
                failContentsAfter: { 'ecosystem/hooks/flaky': 1 },
            }),
            () => runCommandInProcess(addCommand, ['flaky'], dir)
        );

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain(
            'Failed to download component "flaky"'
        );
        expect(result.output).toContain('HTTP 500');
        expect(existsSync(join(dir, 'ecosystem'))).toBe(false);
    });

    it(
        'a failed second file leaves no dir, and a retry succeeds',
        async () => {
            const repo: FakeRepo = {
                hooks: {
                    partial: {
                        files: {
                            'partial.ts': 'export function partial() {}\n',
                            'README.md': '# partial\n',
                        },
                    },
                },
                plugins: {},
            };

            const failed = await withMockedFetch(
                githubMock(repo, {
                    failRaw: (p) => p.endsWith('/README.md'),
                }),
                () => runCommandInProcess(addCommand, ['partial'], dir)
            );

            const target = join(dir, 'ecosystem', 'hooks', 'partial');
            expect(failed.exitCode).toBe(1);
            // Neither the target nor its staging dir may survive, or the
            // next `add` would report "already exists — skipped".
            expect(existsSync(target)).toBe(false);
            expect(existsSync(`${target}.download`)).toBe(false);

            const retry = await withMockedFetch(githubMock(repo), () =>
                runCommandInProcess(addCommand, ['partial'], dir)
            );

            expect(retry.exitCode).toBeNull();
            expect(retry.output).not.toContain('already exists');
            expect(retry.output).toContain('Added partial');
            expect(readFileSync(join(target, 'partial.ts'), 'utf8')).toBe(
                'export function partial() {}\n'
            );
            expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe(
                '# partial\n'
            );
        }
    );

    it('adds the good names and exits 1 when one fails', async () => {
        const repo: FakeRepo = {
            hooks: {
                cors: { files: { 'cors.ts': 'export function cors() {}\n' } },
            },
            plugins: {},
        };

        const result = await withMockedFetch(githubMock(repo), () =>
            runCommandInProcess(addCommand, ['cors', 'nope'], dir)
        );

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain('Successfully added 1 package(s)');
        expect(result.output).toContain('Package "nope" not found');
        expect(result.output).toContain('Failed to add 1 package(s)');
        expect(result.output).toContain('Added 1 package(s), 1 failed');
        expect(
            existsSync(join(dir, 'ecosystem', 'hooks', 'cors', 'cors.ts'))
        ).toBe(true);
    });

    it('reports the connection error when GitHub is unreachable', async () => {
        const result = await withMockedFetch(
            () => {
                throw new Error('connect ECONNREFUSED 127.0.0.1:9');
            },
            () => runCommandInProcess(addCommand, ['cors'], dir)
        );

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain('Could not connect to GitHub');
        expect(result.output).toContain('connect ECONNREFUSED');
        expect(existsSync(join(dir, 'ecosystem'))).toBe(false);
    });

    it('prints .js usage hints for a JS project (jsconfig.json)', async () => {
        await Bun.write(join(dir, 'jsconfig.json'), '{}');
        const repo: FakeRepo = {
            hooks: {
                cors: { files: { 'cors.ts': 'export function cors() {}\n' } },
            },
            plugins: {},
        };

        const result = await withMockedFetch(githubMock(repo), () =>
            runCommandInProcess(addCommand, ['cors'], dir)
        );

        expect(result.exitCode).toBeNull();
        expect(result.output).toContain('// src/hooks.js');
        expect(result.output).not.toContain('// src/hooks.ts');
    });
});
