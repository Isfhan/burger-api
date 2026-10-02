/**
 * Full E2E: `api-prefix` — a plain project under `/v1`, used for the
 * deployment-target checks: build + start, standalone bundle, node, deno,
 * and cloudflare (wrangler dev). Missing runtimes skip with a clear record.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAvailablePort } from '../test-utils';
import {
    REPO_ROOT,
    cleanupE2E,
    cli,
    commandAvailable,
    copyBundleAlone,
    createFullProject,
    createLinkSandbox,
    doctorJson,
    e2eEnv,
    inspectJson,
    nodeMajorVersion,
    recordSkip,
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
    dir = await createFullProject(sandbox, 'api-prefix', [
        '--api-prefix',
        '/v1',
    ]);
    const generate = await cli(dir, ['generate', 'route', 'ping'], env);
    if (generate.code !== 0) {
        throw new Error(`generate route ping failed:\n${generate.out}`);
    }

    // `--target=node` resolves @burger-api/node-server from the project.
    const dist = join(
        REPO_ROOT,
        'packages',
        'node-server',
        'dist',
        'src',
        'index.js'
    );
    if (!existsSync(dist)) {
        const build = await runCommand(['bun', 'run', 'build'], {
            cwd: join(REPO_ROOT, 'packages', 'node-server'),
            timeoutMs: 240_000,
        });
        if (build.code !== 0) {
            throw new Error(`node-server build failed:\n${build.err}`);
        }
    }
    const link = await runCommand(
        ['bun', 'link', '@burger-api/node-server'],
        { cwd: dir, env, timeoutMs: 60_000 }
    );
    if (link.code !== 0) {
        throw new Error(`bun link node-server failed:\n${link.err}`);
    }
}, T);

afterAll(cleanupE2E);

async function runPrefixSmoke(base: string): Promise<void> {
    await runSmoke(base, {
        title: 'api-prefix',
        healthPath: '/v1/ping',
        unknownPath: '/v1/nope',
    });
    expect((await fetch(`${base}/api/ping`)).status).toBe(404);
}

async function resolveWrangler(): Promise<string[] | undefined> {
    if (await commandAvailable(['wrangler', '--version'], env)) {
        return ['wrangler'];
    }
    if (await commandAvailable(['bunx', 'wrangler', '--version'], env)) {
        return ['bunx', 'wrangler'];
    }
    return undefined;
}

describe('e2e-full: api-prefix', () => {
    it(
        'doctor passes (text and --json)',
        () =>
            step('api-prefix: doctor', async () => {
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
        'inspect --json honors the /v1 prefix',
        () =>
            step('api-prefix: inspect --json', async () => {
                const result = await inspectJson(dir, env);
                expect(result.config.apiPrefix).toBe('/v1');
                expect(result.apiRoutes.map((r) => r.routePath).sort()).toEqual(
                    ['/v1', '/v1/ping']
                );
            }),
        T
    );

    it(
        'bun run typecheck passes',
        () =>
            step('api-prefix: typecheck', async () => {
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
        'dev boots, serves /v1, 404s /api, and hot-reloads an edit within 20s',
        () =>
            step('api-prefix: dev + edit', async () => {
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
                        readyPath: '/v1/ping',
                        env,
                        timeoutMs: 60_000,
                    },
                    async (base) => {
                        await runPrefixSmoke(base);

                        const file = join(dir, 'src/api/ping/route.ts');
                        const original = readFileSync(file, 'utf8');
                        const edited = original.replace(
                            'return Response.json({ message: `Hello, ${name}!` });',
                            'return Response.json({ message: `Hello, ${name}!`, edited: true });'
                        );
                        expect(edited).not.toBe(original);
                        try {
                            writeFileSync(file, edited, 'utf8');
                            await waitForJson(
                                `${base}/v1/ping`,
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
            step('api-prefix: build + start', async () => {
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
                        readyPath: '/v1/ping',
                        env,
                        timeoutMs: 30_000,
                    },
                    runPrefixSmoke
                );
            }),
        T
    );

    it(
        'standalone bundle copy (no node_modules) passes the smoke set',
        () =>
            step('api-prefix: standalone bundle', async () => {
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
                        readyPath: '/v1/ping',
                        env: { ...env, PORT: String(port) },
                        timeoutMs: 30_000,
                    },
                    runPrefixSmoke
                );
            }),
        T
    );

    it(
        'build --target=node runs under Node >= 24',
        async () => {
            const major = await nodeMajorVersion();
            if (!major || major < 24) {
                recordSkip(
                    'api-prefix: node target',
                    `needs Node >= 24, found ${major ? `v${major}` : 'none'}`
                );
                return;
            }
            await step('api-prefix: node target', async () => {
                const build = await cli(
                    dir,
                    ['build', 'src/index.ts', '--target=node'],
                    env
                );
                expect(build.code).toBe(0);

                const port = await getAvailablePort();
                await withServer(
                    {
                        command: ['node', '.build/bundle/app.js'],
                        cwd: dir,
                        port,
                        readyPath: '/v1/ping',
                        env: { ...env, PORT: String(port) },
                        timeoutMs: 30_000,
                    },
                    runPrefixSmoke
                );
            });
        },
        T
    );

    it(
        'build --target=deno runs under deno serve',
        async () => {
            if (!(await commandAvailable(['deno', '--version'], env))) {
                recordSkip('api-prefix: deno target', 'deno not installed');
                return;
            }
            await step('api-prefix: deno target', async () => {
                const build = await cli(
                    dir,
                    ['build', 'src/index.ts', '--target=deno'],
                    env
                );
                expect(build.code).toBe(0);
                expect(
                    existsSync(join(dir, '.build', 'deno', 'index.ts'))
                ).toBe(true);

                const port = await getAvailablePort();
                await withServer(
                    {
                        // The command the CLI prints, nothing extra: the
                        // scaffolded deno.json must be enough.
                        command: [
                            'deno',
                            'serve',
                            '--port',
                            String(port),
                            '--host',
                            '127.0.0.1',
                            join('.build', 'deno', 'index.ts'),
                        ],
                        cwd: dir,
                        port,
                        readyPath: '/v1/ping',
                        env,
                        timeoutMs: 45_000,
                    },
                    runPrefixSmoke
                );
            });
        },
        T
    );

    it(
        'build --target=cloudflare runs under wrangler dev',
        async () => {
            const wrangler = await resolveWrangler();
            if (!wrangler) {
                recordSkip(
                    'api-prefix: cloudflare target',
                    'wrangler not available'
                );
                return;
            }
            await step('api-prefix: cloudflare target', async () => {
                const build = await cli(
                    dir,
                    ['build', 'src/index.ts', '--target=cloudflare'],
                    env
                );
                expect(build.code).toBe(0);
                expect(
                    existsSync(join(dir, '.build', 'cloudflare', 'index.ts'))
                ).toBe(true);

                const port = await getAvailablePort();
                await withServer(
                    {
                        command: [
                            ...wrangler,
                            'dev',
                            '--port',
                            String(port),
                            '--ip',
                            '127.0.0.1',
                        ],
                        cwd: dir,
                        port,
                        readyPath: '/v1/ping',
                        env,
                        timeoutMs: 90_000,
                    },
                    runPrefixSmoke
                );
            });
        },
        T
    );
});
