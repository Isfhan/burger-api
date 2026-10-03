/**
 * `burger-api list` fresh path (empty cache): the real command action
 * in-process against a mocked GitHub — dir filtering, sorting, README
 * descriptions, and a failing plugins request.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { listCommand } from '../src/commands/list';
import {
    makeTempDir,
    removeDir,
    runCommandInProcess,
    withMockedFetch,
} from './test-utils';

const dirs = (names: string[]) => names.map((name) => ({ name, type: 'dir' }));

let dir = '';
let cacheDir = '';
let originalCacheDir: string | undefined;

beforeEach(() => {
    dir = makeTempDir('burger-list-fresh-');
    cacheDir = makeTempDir('burger-list-fresh-cache-');
    originalCacheDir = process.env.BURGER_API_CACHE_DIR;
    process.env.BURGER_API_CACHE_DIR = cacheDir;
});

afterEach(() => {
    removeDir(dir);
    removeDir(cacheDir);
    if (originalCacheDir === undefined) delete process.env.BURGER_API_CACHE_DIR;
    else process.env.BURGER_API_CACHE_DIR = originalCacheDir;
});

describe('list — fresh catalog (mocked GitHub)', () => {
    it('renders dirs sorted, with README descriptions', async () => {
        const mock = (input: string | URL | Request): Response => {
            const url = new URL(String(input));
            if (url.pathname.endsWith('/contents/ecosystem/hooks')) {
                return Response.json([
                    ...dirs(['zz-hook', 'cors']),
                    // A file entry must not become a catalog row.
                    { name: 'README.md', type: 'file' },
                ]);
            }
            if (url.pathname.endsWith('/contents/ecosystem/plugins')) {
                return Response.json(dirs(['jwt-auth']));
            }
            if (url.pathname.includes('/ecosystem/hooks/cors/README.md')) {
                return new Response(
                    '# cors\nCORS headers for cross-origin requests\n'
                );
            }
            if (
                url.pathname.includes('/ecosystem/plugins/jwt-auth/README.md')
            ) {
                return new Response('# jwt-auth\n' + 'x'.repeat(70) + '\n');
            }
            return new Response(`unexpected URL: ${url.href}`, {
                status: 404,
            });
        };

        const result = await withMockedFetch(mock, () =>
            runCommandInProcess(listCommand, [], dir)
        );

        expect(result.exitCode).toBeNull();
        expect(result.output).toContain('Found available hooks and plugins!');
        expect(result.output).toContain('Available Hooks and Plugins');
        expect(result.output).toContain(
            'CORS headers for cross-origin requests'
        );
        expect(result.output).toContain('No description available');
        // Descriptions over 60 chars are truncated to 57 + '...'.
        expect(result.output).toContain(`${'x'.repeat(57)}...`);
        // Not a directory, so not a row.
        expect(result.output).not.toContain('README.md');

        // Sorted by name across hooks + plugins.
        const order = ['cors', 'jwt-auth', 'zz-hook'].map((n) =>
            result.output.indexOf(n)
        );
        expect(order[0]).toBeGreaterThanOrEqual(0);
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('fails loud when the plugins request errors', async () => {
        const mock = (input: string | URL | Request): Response => {
            const url = new URL(String(input));
            if (url.pathname.endsWith('/contents/ecosystem/hooks')) {
                return Response.json([]);
            }
            if (url.pathname.endsWith('/contents/ecosystem/plugins')) {
                return new Response(
                    JSON.stringify({ message: 'server error' }),
                    { status: 500 }
                );
            }
            return new Response(`unexpected URL: ${url.href}`, {
                status: 500,
            });
        };

        const result = await withMockedFetch(mock, () =>
            runCommandInProcess(listCommand, [], dir)
        );

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain('GitHub request failed (HTTP 500');
        expect(result.output).toContain(
            'Please check your internet connection and try again.'
        );
        expect(result.output).not.toContain('Available Hooks and Plugins');
    });
});
