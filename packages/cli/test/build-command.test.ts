/**
 * `burger-api build` argument validation (exits before building, offline)
 * and the cloudflare target's portable entry + wrangler.toml writing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { makeTempDir, removeDir, runCli } from './test-utils';

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
});
