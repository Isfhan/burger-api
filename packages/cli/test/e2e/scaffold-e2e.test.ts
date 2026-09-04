import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createProject } from '../../src/utils/templates';
import type { CreateOptions } from '../../src/types';
import { getAvailablePort } from '../test-utils';

// Absolute path to the local framework package, used as a `file:` dependency
// below (see `scaffoldProject` for why this replaces `link:`/`bun link`).
const LOCAL_BURGER_API_PATH = resolve(
    import.meta.dir,
    '../../../burger-api'
);

const E2E_TIMEOUT = 240_000;

interface CmdResult {
    code: number;
    out: string;
    err: string;
}

async function run(cmd: string[], cwd: string): Promise<CmdResult> {
    const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
    const [code, out, err] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    return { code, out, err };
}

async function killTree(pid: number): Promise<void> {
    try {
        if (process.platform === 'win32') {
            await run(['taskkill', '/F', '/T', '/PID', String(pid)], '.');
        } else {
            process.kill(pid, 'SIGKILL');
        }
    } catch {
        // already dead
    }
}

/**
 * Runs `bun run <script> -- --port <port>` in the project, waits for the
 * server to answer GET /api, kills the process tree, and returns the status.
 * Returns -1 when the server never came up.
 */
async function bootAndCheck(
    cwd: string,
    port: number,
    script: string
): Promise<number> {
    const proc = Bun.spawn(
        ['bun', 'run', script, '--', '--port', String(port)],
        {
            cwd,
            stdout: 'pipe',
            stderr: 'pipe',
        }
    );
    const outReader = new Response(proc.stdout).text();
    const errReader = new Response(proc.stderr).text();

    const deadline = Date.now() + 45_000;
    let status = -1;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://localhost:${port}/api`);
            status = res.status;
            break;
        } catch {
            await Bun.sleep(300);
        }
    }
    await killTree(proc.pid);
    await outReader;
    await errReader;
    return status;
}

/**
 * Boots `bun run <script>`, waits for GET `path` to answer, returns its
 * status and parsed JSON body, then kills the process tree. Returns
 * `{ status: -1, body: null }` if the server never came up.
 */
async function bootAndCheckPath(
    cwd: string,
    port: number,
    script: string,
    path: string
): Promise<{ status: number; body: unknown }> {
    const proc = Bun.spawn(
        ['bun', 'run', script, '--', '--port', String(port)],
        { cwd, stdout: 'pipe', stderr: 'pipe' }
    );
    const outReader = new Response(proc.stdout).text();
    const errReader = new Response(proc.stderr).text();

    const deadline = Date.now() + 45_000;
    let status = -1;
    let body: unknown = null;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://localhost:${port}${path}`);
            status = res.status;
            body = await res.json().catch(() => null);
            break;
        } catch {
            await Bun.sleep(300);
        }
    }
    await killTree(proc.pid);
    await outReader;
    await errReader;
    return { status, body };
}

/**
 * Boots `bun run dev`, waits for it to serve GET /api, then creates a
 * brand-new route directory while dev keeps running (never restarting it
 * manually) and polls the new route until it serves or a timeout elapses.
 * Kills the process tree and returns the new route's final status (-1 if
 * dev never came up at all).
 *
 * Regression test for: `bun --watch` only tracks modules already reachable
 * from the entry's import graph, so a route directory that's never been
 * imported is invisible to it — a brand-new route silently 404'd until dev
 * was manually restarted. `dev.ts` now owns its own recursive directory
 * watcher instead of relying on `--watch` alone.
 */
async function bootAddRouteAndCheck(cwd: string, port: number): Promise<number> {
    const proc = Bun.spawn(['bun', 'run', 'dev', '--', '--port', String(port)], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const outReader = new Response(proc.stdout).text();
    const errReader = new Response(proc.stderr).text();

    // Polls until the route answers 200, not just until it answers at all —
    // a brand-new route legitimately 404s for a while before the watcher's
    // restart lands, and that transient 404 is exactly the case under test.
    const waitFor = async (path: string, deadlineMs: number): Promise<number> => {
        const deadline = Date.now() + deadlineMs;
        let lastStatus = -1;
        while (Date.now() < deadline) {
            try {
                const res = await fetch(`http://localhost:${port}${path}`);
                lastStatus = res.status;
                if (lastStatus === 200) return lastStatus;
            } catch {
                // not up yet
            }
            await Bun.sleep(300);
        }
        return lastStatus;
    };

    let finalStatus = -1;
    const readyStatus = await waitFor('/api', 45_000);
    if (readyStatus === 200) {
        const routeDir = join(cwd, 'src', 'api', 'brand-new-route');
        const { mkdir, writeFile: writeFileP } = await import('fs/promises');
        await mkdir(routeDir, { recursive: true });
        await writeFileP(
            join(routeDir, 'route.ts'),
            'export const GET = () => Response.json({ fresh: true });\n'
        );
        finalStatus = await waitFor('/api/brand-new-route', 20_000);
    }

    await killTree(proc.pid);
    await outReader;
    await errReader;
    return finalStatus;
}

/**
 * Creates a project scaffold and installs the local burger-api package as a
 * `file:` dependency, then runs `bun install`.
 *
 * Deliberately NOT `link:` / `bun link`: `packages/burger-api/examples/*`
 * all depend on `link:burger-api` against the same global link target. If
 * this test also links `burger-api` into the scaffold, the scaffold's
 * `node_modules/burger-api` (a symlink to `packages/burger-api`) and every
 * example's own `node_modules/burger-api` (symlinks to the same target)
 * form a symlink cycle reachable from the scaffold. `tsc`'s project-file
 * discovery doesn't cycle-detect that, so `bun run typecheck` free-falls
 * into it and crashes with a JS heap OOM (SIGABRT / exit 134) — confirmed by
 * direct repro. `file:` copies the package instead of symlinking it, so the
 * scaffold never sees that cycle. This mirrors the CLI's own documented
 * pre-release testing path (`BURGER_API_SOURCE=<path>`, see
 * `src/utils/templates.ts`'s `burgerApiSourceOverride`), so it's also a more
 * realistic stand-in for what `npm install burger-api` gives a real user.
 */
async function scaffoldProject(
    name: string,
    lang: 'ts' | 'js'
): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), `burger-e2e-${name}-`));
    const options: CreateOptions = {
        name,
        useApi: true,
        apiDir: 'api',
        apiPrefix: '/api',
        debug: false,
        usePages: false,
        pageDir: 'pages',
        pagePrefix: '/',
        addSkills: false,
        lang,
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

const createdDirs: string[] = [];

function trackDir(dir: string): string {
    createdDirs.push(dir);
    return dir;
}

afterAll(async () => {
    for (const dir of createdDirs) {
        await rm(dir, { recursive: true, force: true });
    }
});

describe('E2E scaffold — TypeScript', () => {
    it(
        'create → dev boot → build → start, all serving GET /api',
        async () => {
            const dir = trackDir(
                await scaffoldProject('e2e-ts', 'ts')
            );

            // dev server boots and serves the route
            const devStatus = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'dev'
            );
            expect(devStatus).toBe(200);

            // generated project typechecks out of the box (types: ["bun"])
            const typecheck = await run(['bun', 'run', 'typecheck'], dir);
            expect(typecheck.code).toBe(0);

            // build produces the AOT bundle
            const build = await run(['bun', 'run', 'build'], dir);
            expect(build.code).toBe(0);
            expect(existsSync(join(dir, '.build', 'bundle', 'app.js'))).toBe(
                true
            );

            // production start serves the bundle
            const startStatus = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'start'
            );
            expect(startStatus).toBe(200);
        },
        E2E_TIMEOUT
    );

    it(
        'dev picks up a brand-new route directory without a manual restart',
        async () => {
            const dir = trackDir(await scaffoldProject('e2e-newroute', 'ts'));
            const status = await bootAddRouteAndCheck(
                dir,
                await getAvailablePort()
            );
            expect(status).toBe(200);
        },
        E2E_TIMEOUT
    );

    it(
        'a route with config.ts behaves identically in dev and in build+start',
        async () => {
            // Regression test for the P0 found in Phase 3: config.ts's
            // default export reached the route as a raw module namespace
            // ({ default: {...} }) in production builds only, so
            // `ctx.config.auth` was always undefined after `build && start`
            // even though the same route worked correctly in `dev`. This
            // route's hook makes that divergence directly observable in the
            // response body, not just the status code.
            const dir = trackDir(await scaffoldProject('e2e-config', 'ts'));
            const routeDir = join(dir, 'src', 'api', 'gate');
            await mkdir(routeDir, { recursive: true });
            await writeFile(
                join(routeDir, 'route.ts'),
                "export const GET = () => Response.json({ ok: true });\n"
            );
            await writeFile(
                join(routeDir, 'config.ts'),
                "import type { RouteConfig } from 'burger-api';\n" +
                    'export default { auth: false } satisfies RouteConfig;\n'
            );
            await writeFile(
                join(routeDir, 'hooks.ts'),
                "import type { BurgerContext } from 'burger-api';\n" +
                    'export const beforeRoute = (ctx: BurgerContext) =>\n' +
                    '    Response.json({ gated: ctx.config?.auth !== false });\n'
            );

            const dev = await bootAndCheckPath(
                dir,
                await getAvailablePort(),
                'dev',
                '/api/gate'
            );
            expect(dev.status).toBe(200);
            expect(dev.body).toEqual({ gated: false });

            const build = await run(['bun', 'run', 'build'], dir);
            expect(build.code).toBe(0);

            const prod = await bootAndCheckPath(
                dir,
                await getAvailablePort(),
                'start',
                '/api/gate'
            );
            expect(prod.status).toBe(200);
            // The regression: this used to come back `{ gated: true }` in
            // production because config.ts's default export never reached
            // ctx.config there.
            expect(prod.body).toEqual({ gated: false });
            expect(prod.body).toEqual(dev.body);
        },
        E2E_TIMEOUT
    );
});

describe('E2E scaffold — JavaScript (--lang js)', () => {
    it(
        'scaffolds .js files, then dev → build → start all serve GET /api',
        async () => {
            const dir = trackDir(await scaffoldProject('e2e-js', 'js'));

            // Scaffold shape: jsconfig.json instead of tsconfig.json
            expect(existsSync(join(dir, 'jsconfig.json'))).toBe(true);
            expect(existsSync(join(dir, 'tsconfig.json'))).toBe(false);

            // .js convention files with JSDoc types
            expect(existsSync(join(dir, 'src', 'index.js'))).toBe(true);
            expect(existsSync(join(dir, 'src', 'api', 'route.js'))).toBe(true);
            const route = await readFile(
                join(dir, 'src', 'api', 'route.js'),
                'utf8'
            );
            expect(route).toContain(
                "@param {import('burger-api').BurgerContext} ctx"
            );
            expect(existsSync(join(dir, 'src', 'openapi.config.js'))).toBe(
                true
            );
            expect(existsSync(join(dir, 'burger.build.js'))).toBe(true);

            // Scripts point at the .js entry
            const pkg = JSON.parse(
                await readFile(join(dir, 'package.json'), 'utf8')
            );
            expect(pkg.scripts.dev).toBe('burger-api dev -f src/index.js');
            expect(pkg.scripts.build).toBe('burger-api build src/index.js');

            // dev server boots and serves the .js route
            const devStatus = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'dev'
            );
            expect(devStatus).toBe(200);

            // build produces the AOT bundle including the .js route
            const build = await run(['bun', 'run', 'build'], dir);
            expect(build.code).toBe(0);
            expect(existsSync(join(dir, '.build', 'bundle', 'app.js'))).toBe(
                true
            );

            // production start serves the route
            const startStatus = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'start'
            );
            expect(startStatus).toBe(200);
        },
        E2E_TIMEOUT
    );
});
