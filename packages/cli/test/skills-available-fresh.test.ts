/**
 * `burger-api skills available` fresh path (empty cache): the real command
 * action in-process against a mocked GitHub — names, descriptions,
 * truncation, and a skill whose info cannot be fetched.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { skillsCommand } from '../src/commands/skills';
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
    dir = makeTempDir('burger-skills-fresh-');
    cacheDir = makeTempDir('burger-skills-fresh-cache-');
    originalCacheDir = process.env.BURGER_API_CACHE_DIR;
    process.env.BURGER_API_CACHE_DIR = cacheDir;
});

afterEach(() => {
    removeDir(dir);
    removeDir(cacheDir);
    if (originalCacheDir === undefined) delete process.env.BURGER_API_CACHE_DIR;
    else process.env.BURGER_API_CACHE_DIR = originalCacheDir;
});

describe('skills available — fresh list (mocked GitHub)', () => {
    it('renders the table with descriptions and fetch failures', async () => {
        const mock = (input: string | URL | Request): Response => {
            const url = new URL(String(input));
            if (url.pathname.endsWith('/contents/ecosystem/skills')) {
                return Response.json(dirs(['alpha', 'beta', 'broken']));
            }
            if (url.pathname.includes('/contents/ecosystem/skills/broken')) {
                return new Response(
                    JSON.stringify({ message: 'server error' }),
                    { status: 500 }
                );
            }
            if (url.pathname.includes('/contents/ecosystem/skills/')) {
                const name = url.pathname.split('/').pop()!;
                return Response.json([
                    {
                        name: 'SKILL.md',
                        type: 'file',
                        download_url:
                            'https://raw.githubusercontent.com/isfhan/' +
                            `burger-api/x/ecosystem/skills/${name}/SKILL.md`,
                    },
                ]);
            }
            if (url.pathname.includes('/ecosystem/skills/alpha/SKILL.md')) {
                return new Response(
                    '---\ndescription: Alpha skill for tests\n---\n\n# Alpha'
                );
            }
            if (url.pathname.includes('/ecosystem/skills/beta/SKILL.md')) {
                return new Response(
                    '---\ndescription: ' + 'y'.repeat(70) + '\n---\n'
                );
            }
            return new Response(`unexpected URL: ${url.href}`, {
                status: 404,
            });
        };

        const result = await withMockedFetch(mock, () =>
            runCommandInProcess(skillsCommand, ['available'], dir)
        );

        expect(result.exitCode).toBeNull();
        expect(result.output).toContain('Available skills');
        expect(result.output).toContain('alpha');
        expect(result.output).toContain('Alpha skill for tests');
        // Descriptions over 60 chars are truncated to 57 + '...'.
        expect(result.output).toContain(`${'y'.repeat(57)}...`);
        expect(result.output).toContain('(could not fetch)');
        expect(result.output).toContain('burger-api skills install <name>');
    });
});
