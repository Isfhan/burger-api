/**
 * GitHub helpers (`src/utils/github.ts`) with a mocked fetch — no network.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
    PRERELEASE_BRANCH,
    detectEcosystemType,
    downloadComponent,
    downloadFile,
    getComponentInfo,
    getSkillList,
    isPrereleaseBuild,
    wrapFetchError,
} from '../src/utils/github';
import {
    makeTempDir,
    removeDir,
    withMockedFetch,
} from './test-utils';

describe('isPrereleaseBuild', () => {
    afterEach(() => {
        delete (globalThis as { CLI_VERSION?: string }).CLI_VERSION;
    });

    it('treats beta, rc, and alpha versions as prereleases', () => {
        for (const version of ['1.0.0-beta', '1.0.0-rc.1', '2.0.0-alpha.3']) {
            (globalThis as { CLI_VERSION?: string }).CLI_VERSION = version;
            expect(isPrereleaseBuild()).toBe(true);
        }
    });

    it('treats stable versions as releases', () => {
        for (const version of ['1.0.0', '2.3.4', '1.0.0-betamax']) {
            (globalThis as { CLI_VERSION?: string }).CLI_VERSION = version;
            expect(isPrereleaseBuild()).toBe(false);
        }
    });
});

describe('isPrereleaseBuild branch selection', () => {
    it('fetches from the prerelease branch for this CLI', async () => {
        // packages/cli is 1.0.0-beta, so ecosystem content comes from the
        // 1.0 development branch until stable 1.0 ships on main.
        expect(isPrereleaseBuild()).toBe(true);

        let requestedUrl = '';
        await withMockedFetch(
            (input) => {
                requestedUrl = String(input);
                return Response.json([]);
            },
            () => getSkillList()
        );

        expect(requestedUrl).toContain(
            encodeURIComponent(PRERELEASE_BRANCH)
        );
    });
});

describe('detectEcosystemType', () => {
    it('returns "hook" without checking plugins when it exists', async () => {
        const requested: string[] = [];
        const type = await withMockedFetch(
            (input) => {
                requested.push(new URL(String(input)).pathname);
                return new Response('ok', { status: 200 });
            },
            () => detectEcosystemType('cors')
        );

        expect(type).toBe('hook');
        expect(requested.some((p) => p.includes('/hooks/cors'))).toBe(true);
        expect(requested.some((p) => p.includes('/plugins/'))).toBe(false);
    });

    it('returns "plugin" when only the plugin exists', async () => {
        const type = await withMockedFetch(
            (input) =>
                new URL(String(input)).pathname.includes('/hooks/')
                    ? new Response('not found', { status: 404 })
                    : new Response('ok', { status: 200 }),
            () => detectEcosystemType('jwt-auth')
        );

        expect(type).toBe('plugin');
    });

    it('returns null when neither exists', async () => {
        const type = await withMockedFetch(
            () => new Response('not found', { status: 404 }),
            () => detectEcosystemType('nope')
        );

        expect(type).toBeNull();
    });

    it(
        'throws instead of reporting "not found" on GitHub failure',
        async () => {
            await expect(
                withMockedFetch(
                    () =>
                        new Response(
                            JSON.stringify({ message: 'server error' }),
                            { status: 500 }
                        ),
                    () => detectEcosystemType('cors')
                )
            ).rejects.toThrow('GitHub request failed (HTTP 500');
        }
    );

    it('throws a connection error when fetch rejects', async () => {
        await expect(
            withMockedFetch(
                () => {
                    throw new Error('connect ECONNREFUSED');
                },
                () => detectEcosystemType('cors')
            )
        ).rejects.toThrow('connect ECONNREFUSED');
    });
});

describe('downloadFile', () => {
    let dir = '';

    beforeEach(() => {
        dir = makeTempDir('burger-download-');
    });

    afterEach(() => {
        removeDir(dir);
    });

    it('writes the downloaded body, creating parent directories', async () => {
        const target = join(dir, 'nested', 'deep', 'file.txt');

        await withMockedFetch(
            () => new Response('file body'),
            () => downloadFile('ecosystem/hooks/cors/cors.ts', target)
        );

        expect(readFileSync(target, 'utf8')).toBe('file body');
    });

    it('reports the path on an error status', async () => {
        await expect(
            withMockedFetch(
                () => new Response('missing', { status: 404 }),
                () =>
                    downloadFile(
                        'ecosystem/hooks/gone/gone.ts',
                        join(dir, 'gone.ts')
                    )
            )
        ).rejects.toThrow(
            'Could not download ecosystem/hooks/gone/gone.ts'
        );
        expect(existsSync(join(dir, 'gone.ts'))).toBe(false);
    });

    it('turns an aborted fetch into a timeout message', async () => {
        await expect(
            withMockedFetch(
                () => {
                    throw new DOMException(
                        'The operation was aborted.',
                        'AbortError'
                    );
                },
                () =>
                    downloadFile(
                        'ecosystem/hooks/cors/cors.ts',
                        join(dir, 'f')
                    )
            )
        ).rejects.toThrow(
            'Request timed out. Please check your internet connection.'
        );
    });

    it('keeps the underlying network error message', async () => {
        await expect(
            withMockedFetch(
                () => {
                    throw new Error('getaddrinfo ENOTFOUND');
                },
                () =>
                    downloadFile(
                        'ecosystem/hooks/cors/cors.ts',
                        join(dir, 'f')
                    )
            )
        ).rejects.toThrow('getaddrinfo ENOTFOUND');
    });
});

describe('downloadComponent', () => {
    let dir = '';

    beforeEach(() => {
        dir = makeTempDir('burger-component-');
    });

    afterEach(() => {
        removeDir(dir);
    });

    it('downloads every listed file and returns the count', async () => {
        const component = 'ecosystem/hooks/cors';
        const rawUrl = (name: string) =>
            `https://raw.githubusercontent.com/x/${component}/${name}`;
        const files: Record<string, string> = {
            'cors.ts': 'export function cors() {}\n',
            'README.md': '# cors\n',
        };

        const count = await withMockedFetch(
            (input) => {
                const url = new URL(String(input));
                if (url.pathname.includes('/contents/')) {
                    return Response.json(
                        Object.keys(files).map((name) => ({
                            name,
                            path: `${component}/${name}`,
                            type: 'file',
                            download_url: rawUrl(name),
                            size: 1,
                        }))
                    );
                }
                const content = files[url.pathname.split('/').pop()!];
                return content === undefined
                    ? new Response('missing', { status: 404 })
                    : new Response(content);
            },
            () => downloadComponent('cors', dir, 'hook')
        );

        expect(count).toBe(2);
        expect(readFileSync(join(dir, 'cors.ts'), 'utf8')).toBe(
            'export function cors() {}\n'
        );
        expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe(
            '# cors\n'
        );
        // The dir-creating placeholder is removed again.
        expect(existsSync(join(dir, '.gitkeep'))).toBe(false);
    });

    it('reports a missing component by name', async () => {
        await expect(
            withMockedFetch(
                () => new Response('not found', { status: 404 }),
                () => downloadComponent('nope', dir, 'hook')
            )
        ).rejects.toThrow('Failed to download component "nope"');
    });
});

describe('getComponentInfo', () => {
    it('surfaces rate limits instead of reporting not-found', async () => {
        await expect(
            withMockedFetch(
                () =>
                    new Response(
                        JSON.stringify({ message: 'API rate limit exceeded' }),
                        { status: 403 }
                    ),
                () => getComponentInfo('cors', 'hook')
            )
        ).rejects.toThrow('GitHub API rate limit likely exceeded');
    });
});

describe('wrapFetchError', () => {
    it('maps abort errors to the timeout message', () => {
        const err = new DOMException('aborted', 'AbortError');
        expect(wrapFetchError(err, 'fallback').message).toBe(
            'Request timed out. Please check your internet connection.'
        );
    });

    it('keeps an Error message', () => {
        expect(wrapFetchError(new Error('boom'), 'fallback').message).toBe(
            'boom'
        );
    });

    it('uses the fallback message for non-Error values', () => {
        expect(wrapFetchError('nope', 'fallback').message).toBe('fallback');
    });
});
