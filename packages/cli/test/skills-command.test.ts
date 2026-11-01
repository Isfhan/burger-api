import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { parseSkillDescription, flattenSkillFiles } from '../src/utils/github';
import { makeTempDir, removeDir, runCli } from './test-utils';

describe('skills command', () => {
    test('skills --help exits 0', async () => {
        const { exitCode, stdout } = await runCli(['skills', '--help']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('install');
        expect(stdout).toContain('list');
        expect(stdout).toContain('available');
    });

    test('skills install --help exits 0', async () => {
        const { exitCode, stdout } = await runCli([
            'skills',
            'install',
            '--help',
        ]);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('[name]');
    });

    test('skills list --help exits 0', async () => {
        const { exitCode, stdout } = await runCli(['skills', 'list', '--help']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('List installed');
    });

    test('skills available --help exits 0', async () => {
        const { exitCode, stdout } = await runCli([
            'skills',
            'available',
            '--help',
        ]);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('List available');
    });

    test('skills list exits 0 in project with no skills dir', async () => {
        const tmpDir = makeTempDir('skills-test-');
        try {
            writeFileSync(
                join(tmpDir, 'package.json'),
                JSON.stringify({ name: 'test', version: '0.0.0' })
            );
            writeFileSync(join(tmpDir, 'index.ts'), 'console.log("hello");');

            const { exitCode, stdout } = await runCli(['skills', 'list'], {
                cwd: tmpDir,
            });
            expect(exitCode).toBe(0);
            expect(stdout).toContain('No skills installed yet');
        } finally {
            removeDir(tmpDir);
        }
    });

    test('skills list displays installed skill from fixture', async () => {
        const tmpDir = makeTempDir('skills-test-');
        try {
            writeFileSync(
                join(tmpDir, 'package.json'),
                JSON.stringify({ name: 'test', version: '0.0.0' })
            );
            writeFileSync(join(tmpDir, 'index.ts'), 'console.log("hello");');

            const skillDir = join(tmpDir, '.agents', 'skills', 'burger-api');
            mkdirSync(skillDir, { recursive: true });
            writeFileSync(
                join(skillDir, 'SKILL.md'),
                '---\ndescription: Build APIs with BurgerAPI\n---\n\n# BurgerAPI'
            );

            const { exitCode, stdout } = await runCli(['skills', 'list'], {
                cwd: tmpDir,
            });
            expect(exitCode).toBe(0);
            expect(stdout).toContain('burger-api');
            expect(stdout).toContain('Build APIs with BurgerAPI');
        } finally {
            removeDir(tmpDir);
        }
    });

    test('skills list dedupes a skill installed in both folders', async () => {
        const tmpDir = makeTempDir('skills-test-');
        try {
            writeFileSync(
                join(tmpDir, 'package.json'),
                JSON.stringify({ name: 'test', version: '0.0.0' })
            );

            for (const root of ['.agents', '.claude']) {
                const skillDir = join(tmpDir, root, 'skills', 'dedupe-skill');
                mkdirSync(skillDir, { recursive: true });
                writeFileSync(
                    join(skillDir, 'SKILL.md'),
                    '---\ndescription: Listed once\n---\n\n# Skill'
                );
            }

            const { exitCode, stdout } = await runCli(['skills', 'list'], {
                cwd: tmpDir,
            });
            expect(exitCode).toBe(0);
            expect(stdout.match(/dedupe-skill/g)).toHaveLength(1);
            expect(stdout).toContain(
                'installed in .agents/skills, .claude/skills'
            );
        } finally {
            removeDir(tmpDir);
        }
    });

    test('skills list shows a skill from .claude/skills/ only', async () => {
        const tmpDir = makeTempDir('skills-test-');
        try {
            writeFileSync(
                join(tmpDir, 'package.json'),
                JSON.stringify({ name: 'test', version: '0.0.0' })
            );

            const skillDir = join(tmpDir, '.claude', 'skills', 'claude-only');
            mkdirSync(skillDir, { recursive: true });
            writeFileSync(
                join(skillDir, 'SKILL.md'),
                '---\ndescription: Claude folder\n---\n\n# Skill'
            );

            const { exitCode, stdout } = await runCli(['skills', 'list'], {
                cwd: tmpDir,
            });
            expect(exitCode).toBe(0);
            expect(stdout).toContain('claude-only');
            expect(stdout).toContain('installed in .claude/skills');
        } finally {
            removeDir(tmpDir);
        }
    });
});

describe('parseSkillDescription', () => {
    test('extracts description from YAML frontmatter', () => {
        const raw = `---
description: Build APIs with BurgerAPI
---

# BurgerAPI`;
        const { description, version } = parseSkillDescription(raw);
        expect(description).toBe('Build APIs with BurgerAPI');
        expect(version).toBeUndefined();
    });

    test('extracts version when present in frontmatter', () => {
        const raw = `---
name: burger-api
version: 1.0.0
description: Build APIs with BurgerAPI
---

# BurgerAPI`;
        const { description, version } = parseSkillDescription(raw);
        expect(description).toBe('Build APIs with BurgerAPI');
        expect(version).toBe('1.0.0');
    });

    test('handles missing description field', () => {
        const raw = `---
name: burger-api
---

# BurgerAPI`;
        const { description, version } = parseSkillDescription(raw);
        expect(description).toBe('(no description)');
        expect(version).toBeUndefined();
    });

    test('handles empty string', () => {
        const { description, version } = parseSkillDescription('');
        expect(description).toBe('(no description)');
        expect(version).toBeUndefined();
    });

    test('handles no frontmatter at all', () => {
        const raw = '# Just a heading\n\nSome content';
        const { description, version } = parseSkillDescription(raw);
        expect(description).toBe('(no description)');
        expect(version).toBeUndefined();
    });

    test('strips surrounding quotes from values', () => {
        const raw = `---
description: "Build APIs with BurgerAPI"
version: '1.0.0'
---`;
        const { description, version } = parseSkillDescription(raw);
        expect(description).toBe('Build APIs with BurgerAPI');
        expect(version).toBe('1.0.0');
    });
});

describe('flattenSkillFiles', () => {
    test('flattens a nested tree into relative paths', async () => {
        const tree: Record<string, { name: string; type: string }[]> = {
            'ecosystem/skills/demo': [
                { name: 'SKILL.md', type: 'file' },
                { name: 'refs', type: 'dir' },
            ],
            'ecosystem/skills/demo/refs': [
                { name: 'guide.md', type: 'file' },
                { name: 'nested', type: 'dir' },
            ],
            'ecosystem/skills/demo/refs/nested': [
                { name: 'deep.txt', type: 'file' },
            ],
        };
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: string | URL | Request) => {
            const path = String(input).split('/contents/')[1]?.split('?')[0];
            const entries = path ? tree[path] : undefined;
            if (!entries) return new Response('not found', { status: 404 });
            return Response.json(entries);
        }) as typeof fetch;
        try {
            const files = await flattenSkillFiles('ecosystem/skills/demo');
            expect(files).toEqual([
                'SKILL.md',
                'refs/guide.md',
                'refs/nested/deep.txt',
            ]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
