/**
 * E2E: `burger-api build --target=<platform>` against a real scaffolded
 * project. Confirms the portable-target path (no Bun.build — the generated
 * entry is written out directly) actually produces a working artifact, the
 * platform config gets scaffolded, and a WebSocket route on a target that
 * can't support it (`vercel`) fails the build with a clear error instead of
 * silently dropping the route.
 *
 * `cloudflare`/`deno` are additionally boot-tested live in this session's
 * manual verification against real `wrangler dev` / `deno serve` — not
 * repeated here since spawning those tools per-CI-run is slow and requires
 * them on PATH. This test covers what every environment can check: the
 * generated files are correct and the build's exit code is right.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createProject } from '../../src/utils/templates';
import type { CreateOptions } from '../../src/types';

const LOCAL_BURGER_API_PATH = resolve(import.meta.dir, '../../../burger-api');
const E2E_TIMEOUT = 120_000;

async function run(
    cmd: string[],
    cwd: string
): Promise<{ code: number; out: string; err: string }> {
    const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
    const [code, out, err] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    return { code, out, err };
}

const createdDirs: string[] = [];
afterAll(async () => {
    for (const dir of createdDirs) {
        await rm(dir, { recursive: true, force: true });
    }
});

async function scaffold(name: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), `burger-e2e-${name}-`));
    createdDirs.push(dir);
    const options: CreateOptions = {
        name,
        useApi: true,
        apiDir: 'api',
        apiPrefix: '/api',
        debug: false,
        usePages: false,
        addSkills: false,
        lang: 'ts',
    };
    await createProject(dir, options);

    const pkgPath = join(dir, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    pkg.dependencies['burger-api'] = `file:${LOCAL_BURGER_API_PATH}`;
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

    const install = await run(['bun', 'install'], dir);
    expect(install.code).toBe(0);
    return dir;
}

const CLI_ENTRY = resolve(import.meta.dir, '../../src/index.ts');

describe('E2E build --target', () => {
    it(
        '--target=cloudflare writes a portable entry + scaffolds wrangler.toml',
        async () => {
            const dir = await scaffold('cf-target');
            const build = await run(
                ['bun', CLI_ENTRY, 'build', 'src/index.ts', '--target=cloudflare'],
                dir
            );
            expect(build.code).toBe(0);

            const entryPath = join(dir, '.build/cloudflare/index.ts');
            expect(existsSync(entryPath)).toBe(true);
            const entrySource = await readFile(entryPath, 'utf8');
            expect(entrySource).toContain('runtimeTarget: "cloudflare"');
            expect(entrySource).toContain(
                'export default { fetch: toFetchHandler(app) };'
            );

            const wranglerPath = join(dir, 'wrangler.toml');
            expect(existsSync(wranglerPath)).toBe(true);
            const wrangler = await readFile(wranglerPath, 'utf8');
            expect(wrangler).toContain('main = ".build/cloudflare/index.ts"');
            expect(wrangler).toContain('compatibility_flags = ["nodejs_compat"]');
        },
        E2E_TIMEOUT
    );

    it(
        '--target=vercel rejects a project with WebSocket routes at build time',
        async () => {
            const dir = await scaffold('vercel-ws-reject');
            await mkdir(join(dir, 'src/websocket/chat'), { recursive: true });
            await writeFile(
                join(dir, 'src/websocket/chat/ws.ts'),
                'export function open() {}\n'
            );

            const build = await run(
                ['bun', CLI_ENTRY, 'build', 'src/index.ts', '--target=vercel'],
                dir
            );
            expect(build.code).not.toBe(0);
            expect(build.err + build.out).toContain(
                'does not support WebSocket routes'
            );
            // Must fail before producing an artifact — no silent partial build.
            expect(existsSync(join(dir, 'api/index.ts'))).toBe(false);
        },
        E2E_TIMEOUT
    );

    it(
        'an unknown --target is rejected with a clear error, not a silent fallback',
        async () => {
            const dir = await scaffold('bad-target');
            const build = await run(
                ['bun', CLI_ENTRY, 'build', 'src/index.ts', '--target=aws-lambda'],
                dir
            );
            expect(build.code).not.toBe(0);
            expect(build.err + build.out).toContain('Unknown --target');
        },
        E2E_TIMEOUT
    );
});
