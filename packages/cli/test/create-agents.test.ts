import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    createProject,
    generateAgentsMd,
} from '../src/utils/templates';
import type { CreateOptions } from '../src/types';
import { baseCreateOptions as baseOptions } from './test-utils';

const createdDirs: string[] = [];

async function scaffold(
    name: string,
    overrides: Partial<CreateOptions> = {}
): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), `burger-agents-${name}-`));
    createdDirs.push(dir);
    await createProject(dir, baseOptions({ name, ...overrides }));
    return dir;
}

afterAll(async () => {
    for (const dir of createdDirs) {
        await rm(dir, { recursive: true, force: true });
    }
});

describe('generateAgentsMd', () => {
    it('has the required sections', () => {
        const content = generateAgentsMd(baseOptions());

        for (const heading of [
            '# AGENTS.md',
            '## Commands',
            '## Project layout',
            '## Route convention files',
            '## Rules',
            '## After changes',
            '## Learn more',
        ]) {
            expect(content).toContain(heading);
        }
    });

    it('names the key CLI commands and project files', () => {
        const content = generateAgentsMd(baseOptions());

        for (const command of [
            '`bun run dev`',
            '`bun run build`',
            '`bun run start`',
            '`burger-api doctor`',
            '`burger-api inspect --json`',
            '`burger-api generate route <path>`',
            '`burger-api add <name>`',
        ]) {
            expect(content).toContain(command);
        }

        for (const file of [
            '`src/index.ts`',
            '`src/hooks.ts`',
            '`src/plugins.ts`',
            '`src/providers.ts`',
            '`src/openapi.config.ts`',
            '`burger.build.ts`',
            '`route.ts`',
            '`schema.ts`',
            '`openapi.ts`',
            '`config.ts`',
        ]) {
            expect(content).toContain(file);
        }
    });

    it('leaves no unreplaced template placeholders', () => {
        for (const options of [
            baseOptions(),
            baseOptions({
                lang: 'js',
                useApi: false,
                usePages: true,
                useWs: true,
            }),
        ]) {
            const content = generateAgentsMd(options);
            expect(content).not.toMatch(/\{\{|\}\}/);
            expect(content).not.toContain('undefined');
        }
    });

    it('uses .js file names and JSDoc for a JS project', () => {
        const content = generateAgentsMd(baseOptions({ lang: 'js' }));

        expect(content).toContain('`src/index.js`');
        expect(content).toContain('`route.js`');
        expect(content).toContain('`schema.js`');
        expect(content).toContain('`burger.build.js`');
        expect(content).not.toContain('route.ts');
        expect(content).toContain(
            '| `route.js` | Handlers: `export async function GET(ctx)` |'
        );
        expect(content).toContain(
            "@param {import('burger-api').BurgerContext} ctx"
        );
    });

    it('mentions pages, ws, and custom dirs/prefixes only when enabled', () => {
        const content = generateAgentsMd(
            baseOptions({
                useApi: true,
                apiDir: 'v1',
                apiPrefix: '/v1',
                usePages: true,
                pageDir: 'site',
                pagePrefix: '/web',
                useWs: true,
                wsDir: 'sockets',
            })
        );

        expect(content).toContain('`src/v1/`');
        expect(content).toContain('served under `/v1`');
        expect(content).toContain('`src/site/`');
        expect(content).toContain('served under `/web`');
        expect(content).toContain('`src/sockets/`');
        expect(content).toContain('Each route is a folder under `src/v1/`');
    });

    it('omits pages and ws when disabled, and omits the API dir with --no-api', () => {
        const content = generateAgentsMd(
            baseOptions({ usePages: false, useWs: false, useApi: false })
        );

        expect(content).not.toContain('src/pages/');
        expect(content).not.toContain('src/websocket/');
        expect(content).not.toContain('- `src/api/` - API routes');
        expect(content).toContain(
            'API routes are folders with separate convention files:'
        );
    });

    it('points at the skill folders when skills were installed', () => {
        const content = generateAgentsMd(baseOptions(), true);
        expect(content).toContain(
            '- Skill: `.agents/skills/burger-api/` and `.claude/skills/burger-api/`'
        );
        expect(content).not.toContain('run `burger-api skills install`');
    });

    it('points at the install command when skills were not installed', () => {
        const content = generateAgentsMd(baseOptions(), false);
        expect(content).toContain('- Skill: run `burger-api skills install`');
        expect(content).not.toContain('.agents/skills/burger-api/');
    });
});

describe('create writes AGENTS.md', () => {
    // Claude Code reads AGENTS.md when no CLAUDE.md exists, so no
    // CLAUDE.md is written.
    it('writes AGENTS.md and no CLAUDE.md for a TS project', async () => {
        const noSkills = await scaffold('ts-no-skills', { lang: 'ts' });
        const agents = await readFile(join(noSkills, 'AGENTS.md'), 'utf8');

        expect(agents).toContain('`src/index.ts`');
        expect(agents).toContain('- Skill: run `burger-api skills install`');
        expect(existsSync(join(noSkills, 'CLAUDE.md'))).toBe(false);
    });

    it('writes AGENTS.md and no CLAUDE.md for a JS project', async () => {
        const dir = await scaffold('js-no-skills', { lang: 'js' });
        const agents = await readFile(join(dir, 'AGENTS.md'), 'utf8');

        expect(agents).toContain('`src/index.js`');
        expect(agents).toContain('`route.js`');
        expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
    });

    it('reflects pages and ws in the written file', async () => {
        const dir = await scaffold('ts-pages-ws', {
            usePages: true,
            useWs: true,
        });
        const agents = await readFile(join(dir, 'AGENTS.md'), 'utf8');

        expect(agents).toContain('`src/pages/`');
        expect(agents).toContain('`src/websocket/`');
    });

    it('installs the skill to both folders and mentions them in AGENTS.md', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'burger-agents-skills-'));
        createdDirs.push(dir);
        let downloadCalls = 0;

        await createProject(
            dir,
            baseOptions({ name: 'ts-skills', addSkills: true }),
            {
                download: async (_name, target) => {
                    downloadCalls++;
                    await mkdir(join(target, 'references'), {
                        recursive: true,
                    });
                    await writeFile(
                        join(target, 'SKILL.md'),
                        '---\ndescription: test skill\n---\n\n# Skill'
                    );
                    await writeFile(
                        join(target, 'references', 'routing.md'),
                        '# Routing'
                    );
                    return 2;
                },
            }
        );

        // Downloaded once, then copied to .claude/skills/.
        expect(downloadCalls).toBe(1);
        expect(
            existsSync(join(dir, '.agents', 'skills', 'burger-api', 'SKILL.md'))
        ).toBe(true);
        expect(
            existsSync(
                join(dir, '.agents', 'skills', 'burger-api', 'references', 'routing.md')
            )
        ).toBe(true);
        expect(
            existsSync(join(dir, '.claude', 'skills', 'burger-api', 'SKILL.md'))
        ).toBe(true);
        expect(
            existsSync(
                join(dir, '.claude', 'skills', 'burger-api', 'references', 'routing.md')
            )
        ).toBe(true);

        const agents = await readFile(join(dir, 'AGENTS.md'), 'utf8');
        expect(agents).toContain(
            '- Skill: `.agents/skills/burger-api/` and `.claude/skills/burger-api/`'
        );
    });

    it('still writes AGENTS.md when the skills download fails', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'burger-agents-fail-'));
        createdDirs.push(dir);

        const result = await createProject(
            dir,
            baseOptions({ name: 'ts-fail', addSkills: true }),
            {
                download: async () => {
                    throw new Error('offline');
                },
            }
        );

        expect(result.skillsInstalled).toBe(false);
        expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
        const agents = await readFile(join(dir, 'AGENTS.md'), 'utf8');
        expect(agents).toContain('- Skill: run `burger-api skills install`');
    });
});
