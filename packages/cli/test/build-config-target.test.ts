/**
 * `burger.build.ts`'s `target` is the documented build target: `--target`
 * overrides it, an invalid value fails loud, and the default outfile / hints
 * follow the resolved target.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { makeTempDir, removeDir, runCli } from './test-utils';

let dir = '';

beforeEach(() => {
    dir = makeTempDir('burger-build-config-target-');
});

afterEach(() => {
    removeDir(dir);
});

/** Minimal project with a burger.build.* exporting `buildConfig`. */
function makeProject(buildConfig: Record<string, unknown>): void {
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
            name: 'config-target',
            dependencies: { 'burger-api': '^1.0.0-beta' },
        })
    );
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
        join(dir, 'src', 'index.ts'),
        [
            "import { Burger } from 'burger-api';",
            'const app = new Burger({ apiDir: "./src/api" });',
            'app.serve(4000);',
        ].join('\n')
    );
    mkdirSync(join(dir, 'src', 'api', 'hello'), { recursive: true });
    writeFileSync(
        join(dir, 'src', 'api', 'hello', 'route.ts'),
        'export const GET = () => Response.json({ ok: true });\n'
    );
    writeFileSync(
        join(dir, 'burger.build.ts'),
        `export default ${JSON.stringify(buildConfig)};\n`
    );
}

describe('build — target from burger.build.ts', () => {
    it('builds for the configured target when --target is absent', async () => {
        makeProject({ target: 'deno' });

        const result = await runCli(['build', 'src/index.ts'], { cwd: dir });

        expect(result.exitCode).toBe(0);
        expect(existsSync(join(dir, '.build', 'deno', 'index.ts'))).toBe(true);
        expect(existsSync(join(dir, 'deno.json'))).toBe(true);
        expect(existsSync(join(dir, '.build', 'bundle', 'app.js'))).toBe(false);
        expect(result.stdout).toContain('Deno');
    });

    it('--target overrides the configured target', async () => {
        makeProject({ target: 'deno' });

        const result = await runCli(
            ['build', 'src/index.ts', '--target=cloudflare'],
            { cwd: dir }
        );

        expect(result.exitCode).toBe(0);
        expect(
            existsSync(join(dir, '.build', 'cloudflare', 'index.ts'))
        ).toBe(true);
        expect(existsSync(join(dir, 'deno.json'))).toBe(false);
        expect(result.stdout).toContain('Cloudflare Workers');
    });

    it('fails loud on an invalid configured target', async () => {
        makeProject({ target: 'aws-lambda' });

        const result = await runCli(['build', 'src/index.ts'], { cwd: dir });

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('Unknown target "aws-lambda"');
        expect(result.stdout).toContain(
            'Valid targets: bun, node, cloudflare, deno, vercel'
        );
    });
});
