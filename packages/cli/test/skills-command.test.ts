import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { parseSkillDescription, flattenSkillFiles } from '../src/utils/github';

const cliEntry = join(import.meta.dir, '..', 'src', 'index.ts');

async function runCli(args: string[], cwd?: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
}> {
    const proc = Bun.spawn(['bun', cliEntry, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd,
        env: process.env,
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
}

describe('skills command', () => {
    test('skills --help exits 0', async () => {
        const { exitCode, stdout } = await runCli(['skills', '--help']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('install');
        expect(stdout).toContain('list');
        expect(stdout).toContain('available');
    });

    test('skills install --help exits 0', async () => {
        const { exitCode, stdout } = await runCli(['skills', 'install', '--help']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('[name]');
    });

    test('skills list --help exits 0', async () => {
        const { exitCode, stdout } = await runCli(['skills', 'list', '--help']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('List installed');
    });

    test('skills available --help exits 0', async () => {
        const { exitCode, stdout } = await runCli(['skills', 'available', '--help']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('List available');
    });

    test('skills list exits 0 in project with no skills dir', async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'skills-test-'));
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '0.0.0' }));
        writeFileSync(join(tmpDir, 'index.ts'), 'console.log("hello");');

        const { exitCode, stdout } = await runCli(['skills', 'list'], tmpDir);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('No skills installed yet');

        rmSync(tmpDir, { recursive: true });
    });

    test('skills list displays installed skill from fixture', async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'skills-test-'));
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '0.0.0' }));
        writeFileSync(join(tmpDir, 'index.ts'), 'console.log("hello");');

        // Create a fake installed skill
        const skillDir = join(tmpDir, '.agents', 'skills', 'burger-api');
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(
            join(skillDir, 'SKILL.md'),
            '---\ndescription: Build APIs with BurgerAPI\n---\n\n# BurgerAPI'
        );

        const { exitCode, stdout } = await runCli(['skills', 'list'], tmpDir);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('burger-api');
        expect(stdout).toContain('Build APIs with BurgerAPI');

        rmSync(tmpDir, { recursive: true });
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
    test('is an exported async function', () => {
        expect(typeof flattenSkillFiles).toBe('function');
        expect(flattenSkillFiles.constructor.name).toBe('AsyncFunction');
    });
});
