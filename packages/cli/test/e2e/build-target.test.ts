/**
 * E2E: `burger-api build --target=<platform>` against a real scaffolded
 * project — portable entry output, scaffolded platform config, and a clear
 * build error when `vercel` cannot support a WebSocket route.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { cleanupProjects, run, scaffoldProject } from './helpers';

const E2E_TIMEOUT = 120_000;
const CLI_ENTRY = resolve(import.meta.dir, '../../src/index.ts');

afterAll(cleanupProjects);

describe('E2E build --target', () => {
    it(
        '--target=cloudflare writes a portable entry + scaffolds wrangler.toml',
        async () => {
            const dir = await scaffoldProject('cf-target');
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
            const dir = await scaffoldProject('vercel-ws-reject');
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
            const dir = await scaffoldProject('bad-target');
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
