/**
 * Full E2E: `blog-ts` — a TypeScript, WebSocket-enabled project created and
 * evolved entirely with the real CLI, then exercised through doctor, inspect,
 * typecheck, dev (with a hot edit), build + start, a standalone bundle copy,
 * a compiled executable, and the cloudflare Bun-only warning.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
    chmodSync,
    copyFileSync,
    existsSync,
    readFileSync,
    writeFileSync,
} from 'fs';
import { join } from 'path';
import { getAvailablePort } from '../test-utils';
import { writeBlogApp } from './blog-fixtures';
import {
    CLI_ENTRY,
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
    tempDir,
    waitForJson,
    withServer,
} from './helpers';

const T = 600_000;

let sandbox = '';
let dir = '';
let env: Record<string, string | undefined> = {};

beforeAll(async () => {
    sandbox = await createLinkSandbox();
    env = e2eEnv(sandbox);
    dir = await createFullProject(sandbox, 'blog-ts', ['--ws']);
    const evolve: string[][] = [
        ['add', 'cors', 'logger', 'jwt-auth', '--local'],
        ['generate', 'route', 'auth/login'],
        ['generate', 'route', 'posts'],
        ['generate', 'route', 'posts/[id]'],
        ['generate', 'ws', 'comments'],
        ['generate', 'hook', 'request-id'],
    ];
    for (const args of evolve) {
        const result = await cli(dir, args, env);
        if (result.code !== 0) {
            throw new Error(
                `${args.join(' ')} failed:\n${result.out}\n${result.err}`
            );
        }
    }
    writeBlogApp(dir);
}, T);

afterAll(cleanupE2E);

async function login(base: string): Promise<string> {
    const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'secret' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string };
    return body.token ?? '';
}

async function runBlogSmoke(base: string): Promise<void> {
    await runSmoke(base, {
        title: 'blog-ts',
        healthPath: '/api/posts',
        unknownPath: '/api/nope',
        validationPath: '/api/posts',
        corsPath: '/api/posts',
        auth: {
            loginPath: '/api/auth/login',
            credentials: { username: 'admin', password: 'secret' },
            protectedPath: '/api/posts',
            protectedBody: { title: 'First', body: 'Hello' },
        },
        ws: {
            path: '/comments',
            query: 'postId=1',
            expectContains: '"type":"post"',
            trigger: async () => {
                const token = await login(base);
                const created = await fetch(`${base}/api/posts`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        title: 'Broadcast',
                        body: 'Hello',
                    }),
                });
                expect(created.status).toBe(201);
            },
        },
    });
    const unknownPost = await fetch(`${base}/api/posts/999`);
    expect(unknownPost.status).toBe(404);
}

describe('e2e-full: blog-ts', () => {
    it(
        'doctor passes (text and --json)',
        () =>
            step('blog-ts: doctor', async () => {
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
        'inspect --json lists the expected routes and ws',
        () =>
            step('blog-ts: inspect --json', async () => {
                const result = await inspectJson(dir, env);
                expect(result.apiRoutes.map((r) => r.routePath).sort()).toEqual(
                    ['/api', '/api/auth/login', '/api/posts', '/api/posts/:id']
                );
                const posts = result.apiRoutes.find(
                    (r) => r.routePath === '/api/posts'
                );
                expect(posts?.methods?.sort()).toEqual(['GET', 'POST']);
                expect(result.wsRoutes.map((r) => r.routePath).sort()).toEqual([
                    '/comments',
                    '/echo',
                ]);
                expect(result.hooks.global).toContain('onRequest');
                expect(result.hooks.global).toContain('beforeRoute');
                expect(result.plugins.pluginsFileFound).toBe(true);
            }),
        T
    );

    it(
        'bun run typecheck passes',
        () =>
            step('blog-ts: typecheck', async () => {
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
        'dev boots, serves the smoke set, and hot-reloads an edit within 20s',
        () =>
            step('blog-ts: dev + edit', async () => {
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
                        readyPath: '/api/posts',
                        env,
                        timeoutMs: 60_000,
                    },
                    async (base) => {
                        await runBlogSmoke(base);

                        const file = join(dir, 'src/api/posts/route.ts');
                        const original = readFileSync(file, 'utf8');
                        const edited = original.replace(
                            'Response.json({ posts: ctx.services.posts.list() })',
                            'Response.json({ posts: ctx.services.posts.list(), edited: true })'
                        );
                        expect(edited).not.toBe(original);
                        try {
                            writeFileSync(file, edited, 'utf8');
                            await waitForJson(
                                `${base}/api/posts`,
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
            step('blog-ts: build + start', async () => {
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
                        readyPath: '/api/posts',
                        env,
                        timeoutMs: 30_000,
                    },
                    runBlogSmoke
                );
            }),
        T
    );

    it(
        'standalone bundle copy (no node_modules) passes the smoke set',
        () =>
            step('blog-ts: standalone bundle', async () => {
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
                        readyPath: '/api/posts',
                        env: { ...env, PORT: String(port) },
                        timeoutMs: 30_000,
                    },
                    runBlogSmoke
                );
            }),
        T
    );

    it(
        'build:exec binary copy (no node_modules) passes the smoke set',
        () =>
            step('blog-ts: build:exec', async () => {
                const result = await runCommand(
                    ['bun', CLI_ENTRY, 'build:exec', 'src/index.ts'],
                    { cwd: dir, env, timeoutMs: 600_000 }
                );
                expect(result.code).toBe(0);

                const isWindows = process.platform === 'win32';
                const built = join(
                    dir,
                    '.build',
                    'executable',
                    isWindows ? 'blog-ts.exe' : 'blog-ts'
                );
                expect(existsSync(built)).toBe(true);

                const standalone = tempDir('burger-e2e-full-exec-');
                const exe = join(standalone, isWindows ? 'app.exe' : 'app');
                copyFileSync(built, exe);
                if (!isWindows) chmodSync(exe, 0o755);

                const port = await getAvailablePort();
                await withServer(
                    {
                        command: [exe],
                        cwd: standalone,
                        port,
                        readyPath: '/api/posts',
                        env: { ...env, PORT: String(port) },
                        timeoutMs: 30_000,
                    },
                    runBlogSmoke
                );
            }),
        T
    );

    it(
        'build --target=cloudflare warns about Bun-only APIs (build only)',
        () =>
            step('blog-ts: cloudflare Bun-only warning', async () => {
                const result = await cli(
                    dir,
                    ['build', 'src/index.ts', '--target=cloudflare'],
                    env
                );
                expect(result.code).toBe(0);
                const output = result.out + result.err;
                expect(output).toContain(
                    'Bun-only APIs found for the "cloudflare" target'
                );
                expect(output).toContain('src/api/posts/route.ts');
                expect(
                    existsSync(join(dir, '.build', 'cloudflare', 'index.ts'))
                ).toBe(true);
            }),
        T
    );
});
