/**
 * `burger-api build` argument validation (exits before building, offline)
 * and the cloudflare target's portable entry + wrangler.toml writing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { makeTempDir, removeDir, runCli } from './test-utils';
import { resolveCompiledOutfile } from '../src/commands/build';

let dir = '';

beforeEach(() => {
    dir = makeTempDir('burger-build-cli-');
});

afterEach(() => {
    removeDir(dir);
});

describe('build command — target validation', () => {
    it('rejects an unknown --target with the valid list', async () => {
        const result = await runCli(
            ['build', 'src/index.ts', '--target=aws-lambda'],
            { cwd: dir }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('Unknown --target "aws-lambda"');
        expect(result.stdout).toContain(
            'Valid targets: bun, node, cloudflare, deno, vercel'
        );
    });

    it('rejects --compile with a non-bun target', async () => {
        const result = await runCli(
            ['build', 'src/index.ts', '--compile', '--target=node'],
            { cwd: dir }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('--compile only supports --target=bun');
    });

    it('rejects --compile combined with the browser passthrough', async () => {
        const result = await runCli(
            ['build', 'src/index.ts', '--compile', '--target=browser'],
            { cwd: dir }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain(
            '--compile cannot be combined with --target=browser'
        );
    });
});

describe('compiled outfile resolution (Windows .exe)', () => {
    it('appends .exe for a Windows compile target', () => {
        expect(
            resolveCompiledOutfile('.build/executable/app', 'bun-windows-x64')
        ).toBe('.build/executable/app.exe');
    });

    it('keeps an outfile that already ends in .exe', () => {
        expect(
            resolveCompiledOutfile(
                '.build/executable/app.exe',
                'bun-windows-x64'
            )
        ).toBe('.build/executable/app.exe');
    });

    it('keeps Unix targets untouched', () => {
        expect(
            resolveCompiledOutfile('.build/executable/app', 'bun-linux-x64')
        ).toBe('.build/executable/app');
    });

    it('follows the current platform when no target is given', () => {
        const expected =
            process.platform === 'win32'
                ? '.build/executable/app.exe'
                : '.build/executable/app';
        expect(resolveCompiledOutfile('.build/executable/app', undefined)).toBe(
            expected
        );
    });
});

describe('build command — cloudflare target (offline)', () => {
    it('writes the portable entry and scaffolds wrangler.toml', async () => {
        await Bun.write(
            join(dir, 'package.json'),
            JSON.stringify({ name: 'cf-cli-test' })
        );
        await Bun.write(
            join(dir, 'src', 'index.ts'),
            [
                "import { Burger } from 'burger-api';",
                'const app = new Burger({',
                "    apiDir: './src/api',",
                "    apiPrefix: '/api',",
                '});',
                'app.serve(Number(process.env.PORT) || 4000);',
            ].join('\n')
        );
        await Bun.write(
            join(dir, 'src', 'api', 'hello', 'route.ts'),
            'export const GET = () => Response.json({ ok: true });\n'
        );

        const result = await runCli(
            ['build', 'src/index.ts', '--target=cloudflare'],
            { cwd: dir }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Cloudflare Workers');

        const entryPath = join(dir, '.build', 'cloudflare', 'index.ts');
        expect(existsSync(entryPath)).toBe(true);
        const entry = readFileSync(entryPath, 'utf8');
        expect(entry).toContain('runtimeTarget: "cloudflare"');
        expect(entry).toContain(
            'export default { fetch: toFetchHandler(app) };'
        );

        const wranglerPath = join(dir, 'wrangler.toml');
        expect(existsSync(wranglerPath)).toBe(true);
        const wrangler = readFileSync(wranglerPath, 'utf8');
        expect(wrangler).toContain('name = "cf-cli-test"');
        expect(wrangler).toContain('main = ".build/cloudflare/index.ts"');
        expect(wrangler).toContain(
            'compatibility_flags = ["nodejs_compat"]'
        );
    });

    it('--no-bun-check skips the Bun-only warning', async () => {
        await Bun.write(
            join(dir, 'package.json'),
            JSON.stringify({ name: 'cf-bun-check' })
        );
        await Bun.write(
            join(dir, 'src', 'index.ts'),
            [
                "import { Burger } from 'burger-api';",
                'const app = new Burger({ apiDir: "./src/api" });',
                'app.serve(4000);',
            ].join('\n')
        );
        await Bun.write(
            join(dir, 'src', 'api', 'uses-bun', 'route.ts'),
            [
                'export function GET() {',
                "    return new Response(Bun.file('data.txt').size);",
                '}',
            ].join('\n')
        );

        const warnRun = await runCli(
            ['build', 'src/index.ts', '--target=cloudflare'],
            { cwd: dir }
        );
        expect(warnRun.exitCode).toBe(0);
        expect(warnRun.stdout).toContain('Bun-only APIs');

        const silentRun = await runCli(
            ['build', 'src/index.ts', '--target=cloudflare', '--no-bun-check'],
            { cwd: dir }
        );
        expect(silentRun.exitCode).toBe(0);
        expect(silentRun.stdout).not.toContain('Bun-only APIs');
    });
});
