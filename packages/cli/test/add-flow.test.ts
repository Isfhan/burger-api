/**
 * `burger-api add` real flow, offline: the GitHub calls are mocked and the
 * command action runs in-process in a temp project.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { addCommand } from '../src/commands/add';
import {
    makeTempDir,
    removeDir,
    runCommandInProcess,
    withMockedFetch,
} from './test-utils';

interface FakePackage {
    /** File name -> file content. */
    files: Record<string, string>;
}

interface FakeRepo {
    hooks: Record<string, FakePackage>;
    plugins: Record<string, FakePackage>;
}

/** Serves the two GitHub endpoints `add` uses from an in-memory repo. */
function githubMock(
    repo: FakeRepo,
    overrides: {
        /** Path -> successful contents hits allowed before a 500. */
        failContentsAfter?: Record<string, number>;
    } = {}
): (input: string | URL | Request) => Response {
    const rawBase = 'https://raw.githubusercontent.com/isfhan/burger-api/x';
    const contentsHits = new Map<string, number>();
    return (input: string | URL | Request): Response => {
        const url = new URL(String(input));
        const contents = url.pathname.match(/\/contents\/(.+)$/);
        if (contents) {
            const repoPath = decodeURIComponent(contents[1]!);
            const allowed = overrides.failContentsAfter?.[repoPath];
            if (allowed !== undefined) {
                const hits = contentsHits.get(repoPath) ?? 0;
                contentsHits.set(repoPath, hits + 1);
                if (hits >= allowed) {
                    return new Response(JSON.stringify({ message: 'boom' }), {
                        status: 500,
                    });
                }
            }
            const [, kind, name] = repoPath.split('/');
            const pkg = repo[kind as 'hooks' | 'plugins']?.[name!];
            if (!pkg) return new Response('not found', { status: 404 });
            return Response.json(
                Object.entries(pkg.files).map(([fileName, content]) => ({
                    name: fileName,
                    path: `${repoPath}/${fileName}`,
                    type: 'file',
                    download_url: `${rawBase}/${repoPath}/${fileName}`,
                    size: content.length,
                }))
            );
        }

        const raw = url.pathname.match(/\/ecosystem\/(.+)$/);
        if (raw) {
            const [kind, name, ...fileParts] = raw[1]!.split('/');
            const content =
                repo[kind as 'hooks' | 'plugins']?.[name!]?.files[
                    fileParts.join('/')
                ];
            if (content === undefined) {
                return new Response('not found', { status: 404 });
            }
            return new Response(content);
        }

        return new Response(`unexpected URL: ${url.href}`, { status: 500 });
    };
}

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
});
