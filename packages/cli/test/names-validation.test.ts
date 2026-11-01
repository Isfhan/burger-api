/**
 * Ecosystem names become directory segments and GitHub paths. Traversal or
 * special names must be rejected in one place (utils/names.ts) before any
 * filesystem or network work — or `skills install .. --force` would replace
 * the project directory.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { addCommand } from '../src/commands/add';
import {
    downloadComponent,
    downloadSkill,
    getSkillInfo,
    skillExists,
} from '../src/utils/github';
import {
    assertValidEcosystemName,
    validateEcosystemName,
} from '../src/utils/names';
import {
    makeTempDir,
    removeDir,
    runCli,
    runCommandInProcess,
    withMockedFetch,
} from './test-utils';

const createdDirs: string[] = [];

function project(): string {
    const dir = makeTempDir('burger-names-');
    createdDirs.push(dir);
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'names-test', version: '0.0.0' })
    );
    return dir;
}

afterEach(() => {
    for (const dir of createdDirs) removeDir(dir);
    createdDirs.length = 0;
});

describe('validateEcosystemName', () => {
    it('rejects traversal and special names', () => {
        for (const name of ['..', '../x', 'a/b', 'a\\b', '.', '']) {
            expect(validateEcosystemName(name)).toBeDefined();
        }
    });

    it('rejects uppercase and leading punctuation', () => {
        for (const name of ['My-App', '-app', '_app', '.app']) {
            expect(validateEcosystemName(name)).toBeDefined();
        }
    });

    it('accepts real ecosystem names', () => {
        for (const name of [
            'cors',
            'jwt-auth',
            'rate-limiter',
            'cors_v2',
            'v2.hooks',
            '2fa',
        ]) {
            expect(validateEcosystemName(name)).toBeUndefined();
        }
    });

    it('assertValidEcosystemName throws the validator message', () => {
        expect(() => assertValidEcosystemName('../x')).toThrow(/".." path/);
    });
});

describe('add rejects invalid names before any work', () => {
    let dir = '';

    beforeEach(() => {
        dir = project();
    });

    it('rejects ".." without touching the fs or network', async () => {
        const result = await withMockedFetch(
            () => {
                throw new Error('network must not be reached');
            },
            () => runCommandInProcess(addCommand, ['..'], dir)
        );

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain('".." path segments are not allowed');
        expect(existsSync(join(dir, 'ecosystem'))).toBe(false);
    });

    it('rejects each invalid name and still adds valid ones', async () => {
        const requested: string[] = [];
        const result = await withMockedFetch(
            (input) => {
                requested.push(String(input));
                const url = new URL(String(input));
                if (url.pathname.endsWith('/contents/ecosystem/hooks/cors')) {
                    return Response.json(
                        ['cors.ts', 'README.md'].map((name) => ({
                            name,
                            path: `ecosystem/hooks/cors/${name}`,
                            type: 'file',
                            download_url: `https://raw.githubusercontent.com/x/ecosystem/hooks/cors/${name}`,
                            size: 1,
                        }))
                    );
                }
                if (url.pathname.endsWith('/contents/ecosystem/hooks')) {
                    return Response.json([]);
                }
                if (url.pathname.endsWith('/contents/ecosystem/plugins')) {
                    return Response.json([]);
                }
                return new Response('export function cors() {}\n');
            },
            () =>
                runCommandInProcess(
                    addCommand,
                    ['../x', 'cors', 'a/b'],
                    dir
                )
        );

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain('".." path segments are not allowed');
        expect(result.output).toContain('Invalid name "a/b"');
        expect(result.output).toContain('Successfully added 1 package(s)');
        // The invalid names never reached the network.
        expect(
            requested.some((url) => url.includes('..%2Fx') || url.includes('../x'))
        ).toBe(false);
        expect(requested.some((url) => url.includes('a/b'))).toBe(false);
    });
});

describe('skills install rejects invalid names before any work', () => {
    // Run as a child process: `--local` on the shared command instance would
    // stick and leak into other in-process tests (Commander keeps options
    // between parseAsync calls).
    it('rejects ".. --local --force" without creating skill dirs', async () => {
        const dir = project();

        const result = await runCli(
            ['skills', 'install', '..', '--local', '--force'],
            { cwd: dir }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('".." path segments are not allowed');
        expect(existsSync(join(dir, '.agents'))).toBe(false);
        expect(existsSync(join(dir, '.claude'))).toBe(false);
    });
});

describe('github.ts entry points reject invalid names', () => {
    it('rejects traversal names without fetching', async () => {
        const target = makeTempDir('burger-names-target-');
        createdDirs.push(target);
        // A pre-existing sentinel so tests can prove nothing was replaced.
        mkdirSync(join(target, 'sentinel'), { recursive: true });

        await withMockedFetch(
            () => {
                throw new Error('network must not be reached');
            },
            async () => {
                await expect(
                    downloadComponent('..', join(target, 'out'), 'hook')
                ).rejects.toThrow(/".." path segments/);
                await expect(downloadSkill('..', join(target, 'skill'))).rejects.toThrow(
                    /".." path segments/
                );
                await expect(getSkillInfo('a/b')).rejects.toThrow(
                    /Invalid name "a\/b"/
                );
                await expect(skillExists('.')).rejects.toThrow(/Invalid name/);
            }
        );

        expect(existsSync(join(target, 'sentinel'))).toBe(true);
        expect(existsSync(join(target, 'out'))).toBe(false);
        expect(existsSync(join(target, 'skill'))).toBe(false);
    });
});
