/**
 * Full E2E: `site-js` — a JavaScript project with pages, checked through
 * doctor, inspect, typecheck, dev (with a hot edit), build + start, and a
 * standalone bundle copy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAvailablePort } from '../test-utils';
import {
    cleanupE2E,
    cli,
    copyBundleAlone,
    createFullProject,
    createLinkSandbox,
    doctorJson,
    e2eEnv,
    inspectJson,
    runCommand,
    runSmoke,
    step,
    waitForJson,
    withServer,
} from './helpers';

const T = 600_000;

let dir = '';
let env: Record<string, string | undefined> = {};

beforeAll(async () => {
    const sandbox = await createLinkSandbox();
    env = e2eEnv(sandbox);
    dir = await createFullProject(sandbox, 'site-js', ['--lang', 'js', '--pages']);
    const result = await cli(dir, ['generate', 'route', 'hello'], env);
    if (result.code !== 0) {
        throw new Error(`generate route hello failed:\n${result.out}`);
    }
}, T);

afterAll(cleanupE2E);

async function runSiteSmoke(base: string): Promise<void> {
    await runSmoke(base, {
        title: 'site-js',
        healthPath: '/api/hello',
        unknownPath: '/api/nope',
        pagePaths: ['/'],
    });
    expect((await fetch(`${base}/api`)).status).toBe(200);
}

describe('e2e-full: site-js', () => {
    it(
        'doctor passes (text and --json)',
        () =>
            step('site-js: doctor', async () => {
                const text = await cli(dir, ['doctor'], env);
                expect(text.code).toBe(0);
                expect(text.out).toContain('All checks passed');

                const json = await doctorJson(dir, env);
                expect(json.ok).toBe(true);
                expect(json.errorCount).toBe(0);
            }),
        T
    );

    it(
        'inspect --json lists pages and API routes',
        () =>
            step('site-js: inspect --json', async () => {
                const result = await inspectJson(dir, env);
                expect(result.apiRoutes.map((r) => r.routePath).sort()).toEqual(
                    ['/api', '/api/hello']
                );
                expect(result.pageRoutes.map((r) => r.routePath)).toContain(
                    '/'
                );
            }),
        T
    );

    it(
        'bun run typecheck passes (jsconfig)',
        () =>
            step('site-js: typecheck', async () => {
                const result = await runCommand(['bun', 'run', 'typecheck'], {
                    cwd: dir,
                    env,
                    timeoutMs: 240_000,
                });
                expect(result.code).toBe(0);
            }),
        T
    );

    it(
        'dev boots, serves pages + API, and hot-reloads an edit within 20s',
        () =>
            step('site-js: dev + edit', async () => {
                const port = await getAvailablePort();
                await withServer(
                    {
                        command: [
                            'bun',
                            'run',
                            'dev',
                            '--',
                            '--port',
                            String(port),
                        ],
                        cwd: dir,
                        port,
                        readyPath: '/api/hello',
                        env,
                        timeoutMs: 60_000,
                    },
                    async (base) => {
                        await runSiteSmoke(base);

                        const file = join(dir, 'src/api/hello/route.js');
                        const original = readFileSync(file, 'utf8');
                        const edited = original.replace(
                            'return Response.json({ message: `Hello, ${name}!` });',
                            'return Response.json({ message: `Hello, ${name}!`, edited: true });'
                        );
                        expect(edited).not.toBe(original);
                        try {
                            writeFileSync(file, edited, 'utf8');
                            await waitForJson(
                                `${base}/api/hello`,
                                (body) =>
                                    (body as { edited?: boolean }).edited ===
                                    true,
                                20_000,
                                'dev server did not serve the edited route within 20s'
                            );
                        } finally {
                            writeFileSync(file, original, 'utf8');
                        }
                    }
                );
            }),
        T
    );

    it(
        'build then start passes the smoke set',
        () =>
            step('site-js: build + start', async () => {
                const build = await runCommand(['bun', 'run', 'build'], {
                    cwd: dir,
                    env,
                    timeoutMs: 180_000,
                });
                expect(build.code).toBe(0);
                expect(
                    existsSync(join(dir, '.build', 'bundle', 'app.js'))
                ).toBe(true);

                const port = await getAvailablePort();
                await withServer(
                    {
                        command: [
                            'bun',
                            'run',
                            'start',
                            '--',
                            '--port',
                            String(port),
                        ],
                        cwd: dir,
                        port,
                        readyPath: '/api/hello',
                        env,
                        timeoutMs: 30_000,
                    },
                    runSiteSmoke
                );
            }),
        T
    );

    it(
        'standalone bundle copy (no node_modules) passes the smoke set',
        () =>
            step('site-js: standalone bundle', async () => {
                const build = await runCommand(['bun', 'run', 'build'], {
                    cwd: dir,
                    env,
                    timeoutMs: 180_000,
                });
                expect(build.code).toBe(0);

                const standalone = copyBundleAlone(dir);
                const port = await getAvailablePort();
                await withServer(
                    {
                        command: ['bun', 'app.js'],
                        cwd: standalone,
                        port,
                        readyPath: '/api/hello',
                        env: { ...env, PORT: String(port) },
                        timeoutMs: 30_000,
                    },
                    runSiteSmoke
                );
            }),
        T
    );
});
