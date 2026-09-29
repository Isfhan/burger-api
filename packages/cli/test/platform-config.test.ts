import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
    WRANGLER_COMPATIBILITY_DATE,
    denoJson,
    scaffoldPlatformConfig,
} from '../src/utils/build/platform-config';
import { makeTempDir, removeDir } from './test-utils';

const createdDirs: string[] = [];

function tempProject(pkg: Record<string, unknown> | null): string {
    const dir = makeTempDir('burger-platform-');
    createdDirs.push(dir);
    if (pkg) {
        writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
    }
    return dir;
}

afterEach(() => {
    for (const dir of createdDirs) removeDir(dir);
    createdDirs.length = 0;
});

describe('scaffoldPlatformConfig — cloudflare', () => {
    it('writes wrangler.toml with name, entry, and compat settings', () => {
        const dir = tempProject({ name: 'acme-api' });

        scaffoldPlatformConfig(dir, 'cloudflare', '.build/cloudflare/index.ts');

        expect(readFileSync(join(dir, 'wrangler.toml'), 'utf8')).toBe(
            'name = "acme-api"\n' +
                'main = ".build/cloudflare/index.ts"\n' +
                `compatibility_date = "${WRANGLER_COMPATIBILITY_DATE}"\n` +
                'compatibility_flags = ["nodejs_compat"]\n'
        );
    });

    it('normalizes Windows path separators in main', () => {
        const dir = tempProject({ name: 'acme-api' });

        scaffoldPlatformConfig(
            dir,
            'cloudflare',
            '.build\\cloudflare\\index.ts'
        );

        const wrangler = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
        expect(wrangler).toContain('main = ".build/cloudflare/index.ts"');
        expect(wrangler).not.toContain('\\');
    });

    it('falls back to "app" when there is no project name', () => {
        const dir = tempProject({});

        scaffoldPlatformConfig(dir, 'cloudflare', 'index.ts');

        expect(readFileSync(join(dir, 'wrangler.toml'), 'utf8')).toContain(
            'name = "app"'
        );
    });
});

describe('scaffoldPlatformConfig — deno', () => {
    it("writes deno.json pinning burger-api to the project's npm range", () => {
        const dir = tempProject({
            name: 'acme-api',
            dependencies: { 'burger-api': '^1.0.0-beta' },
        });

        scaffoldPlatformConfig(dir, 'deno', '.build/deno/index.ts');

        const config = JSON.parse(readFileSync(join(dir, 'deno.json'), 'utf8'));
        expect(config).toEqual({
            imports: { 'burger-api': 'npm:burger-api@^1.0.0-beta' },
        });
    });

    it('leaves burger-api unpinned for link/file/workspace/git ranges', () => {
        for (const range of [
            'link:burger-api',
            'file:../burger-api',
            'workspace:*',
            'git+https://github.com/isfhan/burger-api.git',
            'https://example.com/burger-api.tgz',
        ]) {
            const dir = tempProject({
                name: 'acme-api',
                dependencies: { 'burger-api': range },
            });

            scaffoldPlatformConfig(dir, 'deno', '.build/deno/index.ts');

            const config = JSON.parse(
                readFileSync(join(dir, 'deno.json'), 'utf8')
            );
            expect(config.imports['burger-api']).toBe('npm:burger-api');
        }
    });

    it('leaves burger-api unpinned when the dependency is missing', () => {
        const dir = tempProject({ name: 'acme-api', dependencies: {} });

        scaffoldPlatformConfig(dir, 'deno', '.build/deno/index.ts');

        const config = JSON.parse(readFileSync(join(dir, 'deno.json'), 'utf8'));
        expect(config.imports['burger-api']).toBe('npm:burger-api');
    });

    it('denoJson formats with two-space indent and a trailing newline', () => {
        const dir = tempProject({
            name: 'acme-api',
            dependencies: { 'burger-api': '~1.2.3' },
        });

        const content = denoJson(dir);

        expect(content.endsWith('\n')).toBe(true);
        expect(content).toContain('\n  "imports": {');
        expect(content).toContain('npm:burger-api@~1.2.3');
    });
});

describe('scaffoldPlatformConfig — vercel', () => {
    it('writes vercel.json routing everything to /api', () => {
        const dir = tempProject({ name: 'acme-api' });

        scaffoldPlatformConfig(dir, 'vercel', 'api/index.ts');

        const config = JSON.parse(
            readFileSync(join(dir, 'vercel.json'), 'utf8')
        );
        expect(config).toEqual({
            rewrites: [{ source: '/(.*)', destination: '/api' }],
        });
    });
});

describe('scaffoldPlatformConfig — existing configs', () => {
    it('never overwrites an existing config file', () => {
        const cases: Array<{
            target: 'cloudflare' | 'deno' | 'vercel';
            file: string;
            content: string;
        }> = [
            {
                target: 'cloudflare',
                file: 'wrangler.toml',
                content: '# user config\nname = "mine"\n',
            },
            {
                target: 'deno',
                file: 'deno.json',
                content: '{ "user": true }\n',
            },
            {
                target: 'vercel',
                file: 'vercel.json',
                content: '{ "user": true }\n',
            },
        ];

        for (const { target, file, content } of cases) {
            const dir = tempProject({ name: 'acme-api' });
            writeFileSync(join(dir, file), content);

            scaffoldPlatformConfig(dir, target, '.build/index.ts');

            expect(readFileSync(join(dir, file), 'utf8')).toBe(content);
        }
    });

    it('writes nothing for targets without a config file', () => {
        const dir = tempProject({ name: 'acme-api' });

        scaffoldPlatformConfig(dir, 'bun', '.build/bundle/app.js');
        scaffoldPlatformConfig(dir, 'node', '.build/bundle/app.js');

        expect(existsSync(join(dir, 'wrangler.toml'))).toBe(false);
        expect(existsSync(join(dir, 'deno.json'))).toBe(false);
        expect(existsSync(join(dir, 'vercel.json'))).toBe(false);
    });
});
