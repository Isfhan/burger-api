import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    createProject,
    generateAgentsMd,
    generateClaudeMd,
} from '../src/utils/templates';
import type { CreateOptions } from '../src/types';

const createdDirs: string[] = [];

function baseOptions(overrides: Partial<CreateOptions> = {}): CreateOptions {
    return {
        name: 'demo',
        useApi: true,
        apiDir: 'api',
        apiPrefix: '/api',
        debug: false,
        usePages: false,
        pageDir: 'pages',
        pagePrefix: '/',
        useWs: false,
        wsDir: 'websocket',
        addSkills: false,
        lang: 'ts',
        ...overrides,
    };
}

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
    it('stays short (about 40-60 lines)', () => {
        for (const options of [
            baseOptions(),
            baseOptions({ lang: 'js', usePages: true, useWs: true }),
        ]) {
            const lines = generateAgentsMd(options).trimEnd().split('\n').length;
            expect(lines).toBeGreaterThanOrEqual(40);
            expect(lines).toBeLessThanOrEqual(60);
        }
    });

    it('covers commands, layout, route files, and rules for TS', () => {
        const content = generateAgentsMd(baseOptions());

        expect(content).toContain(
            'This is a burger-api project (Bun-first API framework, file-based routing).'
        );
        expect(content).toContain('`bun run dev`');
        expect(content).toContain('`bun run build`');
        expect(content).toContain('`bun run start`');
        expect(content).toContain('`burger-api doctor`');
        expect(content).toContain('`burger-api inspect --json`');
        expect(content).toContain('`burger-api generate route <path>`');
        expect(content).toContain('`burger-api add <name>`');

        expect(content).toContain('`src/index.ts`');
        expect(content).toContain('`src/hooks.ts`');
        expect(content).toContain('`src/plugins.ts`');
        expect(content).toContain('`src/providers.ts`');
        expect(content).toContain('`src/openapi.config.ts`');
        expect(content).toContain('`burger.build.ts`');
        expect(content).toContain('`src/api/`');
        expect(content).toContain('served under `/api`');

        expect(content).toContain('`route.ts`');
        expect(content).toContain('`schema.ts`');
        expect(content).toContain('`hooks.ts`');
        expect(content).toContain('`openapi.ts`');
        expect(content).toContain('`config.ts`');
        expect(content).toContain('Use per-method named exports (`GET`, `POST`, ...)');

        expect(content).toContain(
            'Handlers take `ctx: BurgerContext` and return a Web `Response`.'
        );
        expect(content).toContain('`defineRoute(GetSchema, (ctx) => ...)`');
        expect(content).toContain('`onRequest`');
        expect(content).toContain('`transform`');
        expect(content).toContain('`beforeRoute`');
        expect(content).toContain('`afterRoute`');
        expect(content).toContain('`mapResponse`');
        expect(content).toContain('`onError`');
        expect(content).toContain('`burger.usePlugin()`');
        expect(content).toContain('Do not use middleware');
        expect(content).toContain('`BurgerRequest`');
        expect(content).toContain('lowercase handler names (`get`)');
        expect(content).toContain('`ctx.services` is read-only');
        expect(content).toContain('Run `burger-api doctor`.');
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

describe('generateClaudeMd', () => {
    it('is a comment plus the AGENTS.md import', () => {
        expect(generateClaudeMd()).toBe(
            '<!-- Claude Code reads this file; the project rules live in AGENTS.md. -->\n@AGENTS.md\n'
        );
    });
});

describe('create writes AGENTS.md and CLAUDE.md', () => {
    it('writes both files for a TS project, with and without skills', async () => {
        const noSkills = await scaffold('ts-no-skills', { lang: 'ts' });
        const agents = await readFile(join(noSkills, 'AGENTS.md'), 'utf8');
        const claude = await readFile(join(noSkills, 'CLAUDE.md'), 'utf8');

        expect(existsSync(join(noSkills, 'AGENTS.md'))).toBe(true);
        expect(existsSync(join(noSkills, 'CLAUDE.md'))).toBe(true);
        expect(agents).toContain('`src/index.ts`');
        expect(agents).toContain('- Skill: run `burger-api skills install`');
        expect(claude).toContain('@AGENTS.md');
    });

    it('writes both files for a JS project', async () => {
        const dir = await scaffold('js-no-skills', { lang: 'js' });
        const agents = await readFile(join(dir, 'AGENTS.md'), 'utf8');

        expect(agents).toContain('`src/index.js`');
        expect(agents).toContain('`route.js`');
        expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
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
