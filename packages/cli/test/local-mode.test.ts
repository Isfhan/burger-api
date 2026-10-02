/**
 * Local mode: env/flag detection, checkout discovery, bun link checks, the
 * local ecosystem source (hooks/plugins/skills), and the commands that use it.
 * No network: every local source test reads a fake checkout on disk.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import {
    bunLinkStore,
    isLocalMode,
    localRepoRoot,
    requireLinkedPackages,
    requireLocalRepo,
    setLocalMode,
} from '../src/utils/local-mode';
import {
    detectEcosystemType,
    downloadComponent,
    downloadSkill,
    getCachedComponentCatalog,
    getCachedComponentList,
    getCachedSkillList,
    getComponentInfo,
    getComponentList,
    getSkillInfo,
    getSkillList,
} from '../src/utils/github';
import { runCli, makeTempDir, removeDir } from './test-utils';

const createdDirs: string[] = [];

function makeTemp(prefix: string): string {
    const dir = makeTempDir(prefix);
    createdDirs.push(dir);
    return dir;
}

/** A fake checkout with the markers local mode looks for. */
function makeFakeRepo(): string {
    const root = makeTemp('burger-local-repo-');
    const write = (rel: string, content: string): void => {
        const file = join(root, rel);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
    };
    write('packages/burger-api/package.json', '{"name":"burger-api"}');
    write('packages/cli/package.json', '{"name":"@burger-api/cli"}');
    write('ecosystem/hooks/cors/cors.ts', 'export function cors() {}\n');
    write('ecosystem/hooks/cors/README.md', '# CORS\nCross-origin support.\n');
    write('ecosystem/hooks/cors/.gitkeep', '');
    write(
        'ecosystem/plugins/jwt-auth/jwt-auth.ts',
        'export function jwtAuth() {}\n'
    );
    write(
        'ecosystem/plugins/jwt-auth/README.md',
        '# JWT\nToken authentication.\n'
    );
    write(
        'ecosystem/skills/demo/SKILL.md',
        '---\ndescription: Demo skill\nversion: 1.2.3\n---\n\n# Demo\n'
    );
    write('ecosystem/skills/demo/references/routing.md', '# Routing\n');
    return root;
}

const originalEnv = {
    local: process.env.BURGER_API_LOCAL,
    root: process.env.BURGER_API_LOCAL_ROOT,
    cache: process.env.BURGER_API_CACHE_DIR,
};

afterEach(() => {
    setLocalMode(undefined);
    for (const [key, value] of [
        ['BURGER_API_LOCAL', originalEnv.local],
        ['BURGER_API_LOCAL_ROOT', originalEnv.root],
        ['BURGER_API_CACHE_DIR', originalEnv.cache],
    ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    for (const dir of createdDirs) removeDir(dir);
    createdDirs.length = 0;
});

/** Turn on local mode pointing at a fake checkout. */
function enableLocal(root: string): void {
    process.env.BURGER_API_LOCAL = '1';
    process.env.BURGER_API_LOCAL_ROOT = root;
    setLocalMode(undefined);
}

describe('isLocalMode', () => {
    it('is off by default', () => {
        expect(isLocalMode(undefined, {})).toBe(false);
    });

    it('accepts 1 and true (any case, trimmed)', () => {
        for (const value of ['1', 'true', 'TRUE', ' true ']) {
            expect(isLocalMode(undefined, { BURGER_API_LOCAL: value })).toBe(
                true
            );
        }
    });

    it('rejects other values', () => {
        for (const value of ['0', 'false', 'yes', '']) {
            expect(isLocalMode(undefined, { BURGER_API_LOCAL: value })).toBe(
                false
            );
        }
    });

    it('the --local flag wins over the env', () => {
        expect(isLocalMode(true, { BURGER_API_LOCAL: '0' })).toBe(true);
        expect(isLocalMode(false, { BURGER_API_LOCAL: '1' })).toBe(false);
    });
});

describe('localRepoRoot / requireLocalRepo', () => {
    it('finds the repo root from a nested CLI path', () => {
        const root = makeFakeRepo();
        expect(
            localRepoRoot(join(root, 'packages', 'cli', 'src', 'utils'))
        ).toBe(root);
    });

    it('returns undefined outside a checkout', () => {
        const dir = makeTemp('burger-not-repo-');
        expect(localRepoRoot(dir)).toBeUndefined();
    });

    it('requireLocalRepo throws a clone + bun link setup error', () => {
        const dir = makeTemp('burger-not-repo-');
        expect(() => requireLocalRepo(dir)).toThrow(
            /Clone the repo and run `bun link` in packages\/burger-api and packages\/cli/
        );
    });

    it('requireLocalRepo returns the root inside a checkout', () => {
        const root = makeFakeRepo();
        expect(requireLocalRepo(join(root, 'packages', 'cli'))).toBe(root);
    });
});

describe('requireLinkedPackages', () => {
    it('passes when both packages are in the link store', () => {
        const store = makeTemp('burger-link-store-');
        mkdirSync(join(store, 'burger-api'), { recursive: true });
        mkdirSync(join(store, '@burger-api', 'cli'), { recursive: true });
        expect(() =>
            requireLinkedPackages('/somewhere', store)
        ).not.toThrow();
    });

    it('throws with the exact bun link command for the missing package', () => {
        const store = makeTemp('burger-link-store-');
        mkdirSync(join(store, 'burger-api'), { recursive: true });
        const root = makeFakeRepo();
        expect(() => requireLinkedPackages(root, store)).toThrow(
            `cd ${join(root, 'packages', 'cli')} && bun link`
        );
    });

    it('bunLinkStore follows BUN_INSTALL', () => {
        expect(
            bunLinkStore({ BUN_INSTALL: join('X', 'bun') } as NodeJS.ProcessEnv)
        ).toBe(join('X', 'bun', 'install', 'global', 'node_modules'));
    });
});

describe('local ecosystem source', () => {
    let root = '';

    beforeEach(() => {
        root = makeFakeRepo();
        enableLocal(root);
    });

    it('lists hooks and plugins from the checkout, sorted', async () => {
        const list = await getComponentList();
        expect(list).toEqual([
            { name: 'cors', kind: 'hook' },
            { name: 'jwt-auth', kind: 'plugin' },
        ]);
    });

    it('reads component info and README description from disk', async () => {
        const info = await getComponentInfo('cors', 'hook');
        expect(info.description).toBe('Cross-origin support.');
        expect(info.files.sort()).toEqual(['.gitkeep', 'README.md', 'cors.ts']);
    });

    it('detects hook, plugin, and unknown names without the network', async () => {
        expect(await detectEcosystemType('cors')).toBe('hook');
        expect(await detectEcosystemType('jwt-auth')).toBe('plugin');
        expect(await detectEcosystemType('nope')).toBeNull();
    });

    it('copies a component atomically, skipping .gitkeep and stale files', async () => {
        const target = join(makeTemp('burger-local-target-'), 'cors');
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, 'stale.ts'), '// stale\n');

        const count = await downloadComponent('cors', target, 'hook');

        expect(count).toBe(2);
        expect(readFileSync(join(target, 'cors.ts'), 'utf8')).toBe(
            'export function cors() {}\n'
        );
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toContain(
            'Cross-origin support.'
        );
        expect(existsSync(join(target, '.gitkeep'))).toBe(false);
        expect(existsSync(join(target, 'stale.ts'))).toBe(false);
        expect(existsSync(`${target}.download`)).toBe(false);
    });

    it('lists, describes, and copies skills recursively', async () => {
        expect(await getSkillList()).toEqual(['demo']);

        const info = await getSkillInfo('demo');
        expect(info.description).toBe('Demo skill');
        expect(info.version).toBe('1.2.3');
        expect(info.files.sort()).toEqual([
            'SKILL.md',
            'references/routing.md',
        ]);

        const target = join(makeTemp('burger-local-skill-'), 'demo');
        const count = await downloadSkill('demo', target);
        expect(count).toBe(2);
        expect(existsSync(join(target, 'references', 'routing.md'))).toBe(true);
    });

    it('never reads or writes the ecosystem cache', async () => {
        const cacheDir = makeTemp('burger-local-cache-');
        process.env.BURGER_API_CACHE_DIR = cacheDir;

        const list = await getCachedComponentList();
        const catalog = await getCachedComponentCatalog();
        const skills = await getCachedSkillList();

        expect(list.stale).toBe(false);
        expect(catalog.data.map((c) => c.name)).toEqual(['cors', 'jwt-auth']);
        expect(catalog.data[0]?.description).toBe('Cross-origin support.');
        expect(skills.data).toEqual(['demo']);
        expect(readdirSync(cacheDir)).toEqual([]);
    });
});

describe('local-mode commands (real CLI, no network)', () => {
    let root = '';
    let project = '';

    beforeEach(async () => {
        root = makeFakeRepo();
        project = makeTemp('burger-local-project-');
        writeFileSync(
            join(project, 'package.json'),
            JSON.stringify({ name: 'local-test', version: '0.0.0' })
        );
    });

    const env = () => ({
        BURGER_API_LOCAL: '1',
        BURGER_API_LOCAL_ROOT: root,
    });

    it('add installs from the checkout and prints the local mode line', async () => {
        const result = await runCli(['add', 'cors', '--local'], {
            cwd: project,
            env: env(),
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`Local mode: ${root}`);
        expect(
            readFileSync(
                join(project, 'ecosystem', 'hooks', 'cors', 'cors.ts'),
                'utf8'
            )
        ).toBe('export function cors() {}\n');
    });

    it('list shows checkout components with their descriptions', async () => {
        const result = await runCli(['list', '--local'], {
            cwd: project,
            env: env(),
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`Local mode: ${root}`);
        expect(result.stdout).toContain('cors');
        expect(result.stdout).toContain('Cross-origin support.');
        expect(result.stdout).toContain('jwt-auth');
    });

    it('skills available lists checkout skills', async () => {
        const result = await runCli(['skills', 'available', '--local'], {
            cwd: project,
            env: env(),
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`Local mode: ${root}`);
        expect(result.stdout).toContain('demo');
        expect(result.stdout).toContain('Demo skill');
    });

    it('skills install copies from the checkout into both folders', async () => {
        const result = await runCli(
            ['skills', 'install', 'demo', '--local'],
            { cwd: project, env: env() }
        );

        expect(result.exitCode).toBe(0);
        for (const dir of ['.agents', '.claude']) {
            expect(
                readFileSync(
                    join(project, dir, 'skills', 'demo', 'SKILL.md'),
                    'utf8'
                )
            ).toContain('Demo skill');
        }
    });

    it('fails loud when local mode is on outside a checkout', async () => {
        const outside = makeTemp('burger-local-outside-');
        writeFileSync(
            join(outside, 'package.json'),
            JSON.stringify({ name: 'outside', version: '0.0.0' })
        );
        const result = await runCli(['list', '--local'], {
            cwd: outside,
            env: {
                BURGER_API_LOCAL: '1',
                BURGER_API_LOCAL_ROOT: outside,
            },
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr + result.stdout).toContain(
            'Clone the repo and run `bun link`'
        );
    });
});

describe('--force on non-TTY', () => {
    let project = '';
    let root = '';

    beforeEach(async () => {
        root = makeFakeRepo();
        project = makeTemp('burger-force-');
        writeFileSync(
            join(project, 'package.json'),
            JSON.stringify({ name: 'force-test', version: '0.0.0' })
        );
    });

    const env = () => ({
        BURGER_API_LOCAL: '1',
        BURGER_API_LOCAL_ROOT: root,
    });

    it('add without --force skips and mentions --force', async () => {
        const existing = join(project, 'ecosystem', 'hooks', 'cors');
        mkdirSync(existing, { recursive: true });
        writeFileSync(join(existing, 'cors.ts'), '// local edit\n');

        const result = await runCli(['add', 'cors', '--local'], {
            cwd: project,
            env: env(),
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('already exists');
        expect(result.stdout).toContain('--force');
        expect(readFileSync(join(existing, 'cors.ts'), 'utf8')).toBe(
            '// local edit\n'
        );
    });

    it('add --force replaces the install without a prompt', async () => {
        const existing = join(project, 'ecosystem', 'hooks', 'cors');
        mkdirSync(existing, { recursive: true });
        writeFileSync(join(existing, 'cors.ts'), '// local edit\n');
        writeFileSync(join(existing, 'stale.ts'), '// stale\n');

        const result = await runCli(
            ['add', 'cors', '--local', '--force'],
            { cwd: project, env: env() }
        );

        expect(result.exitCode).toBe(0);
        expect(readFileSync(join(existing, 'cors.ts'), 'utf8')).toBe(
            'export function cors() {}\n'
        );
        expect(existsSync(join(existing, 'stale.ts'))).toBe(false);
    });

    it('skills install without --force exits 1 and mentions --force', async () => {
        const installed = join(project, '.agents', 'skills', 'demo');
        mkdirSync(installed, { recursive: true });
        writeFileSync(join(installed, 'SKILL.md'), '# mine\n');

        const result = await runCli(['skills', 'install', 'demo', '--local'], {
            cwd: project,
            env: env(),
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr + result.stdout).toContain('--force');
        expect(readFileSync(join(installed, 'SKILL.md'), 'utf8')).toBe(
            '# mine\n'
        );
    });

    it('skills install --force replaces both copies without a prompt', async () => {
        for (const dir of ['.agents', '.claude']) {
            const installed = join(project, dir, 'skills', 'demo');
            mkdirSync(installed, { recursive: true });
            writeFileSync(join(installed, 'SKILL.md'), '# mine\n');
        }

        const result = await runCli(
            ['skills', 'install', 'demo', '--local', '--force'],
            { cwd: project, env: env() }
        );

        expect(result.exitCode).toBe(0);
        for (const dir of ['.agents', '.claude']) {
            expect(
                readFileSync(
                    join(project, dir, 'skills', 'demo', 'SKILL.md'),
                    'utf8'
                )
            ).toContain('Demo skill');
        }
    });
});
