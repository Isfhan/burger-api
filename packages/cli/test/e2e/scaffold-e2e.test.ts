import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import {
    getAvailablePort,
    killTree,
    treeKillSpawnOptions,
} from '../test-utils';
import { cleanupProjects, run, scaffoldProject } from './helpers';

const E2E_TIMEOUT = 240_000;

/** Boots `bun run <script>`, waits for a path, kills the tree, returns it. */
async function bootAndCheck(
    cwd: string,
    port: number,
    script: string,
    path = '/api'
): Promise<{ status: number; body: unknown }> {
    const proc = Bun.spawn(
        ['bun', 'run', script, '--', '--port', String(port)],
        { cwd, stdout: 'pipe', stderr: 'pipe', ...treeKillSpawnOptions() }
    );
    const outReader = new Response(proc.stdout).text();
    const errReader = new Response(proc.stderr).text();

    const deadline = Date.now() + 45_000;
    let status = -1;
    let body: unknown = null;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}${path}`);
            status = res.status;
            body = await res.json().catch(() => null);
            break;
        } catch {
            await Bun.sleep(300);
        }
    }
    await killTree(proc);
    await outReader;
    await errReader;
    return { status, body };
}

/**
 * Boots `bun run dev`, creates a brand-new route while it runs, and polls
 * it until it serves. Regression: `bun --watch` only tracks modules already
 * imported, so dev needs its own directory watcher to see new routes.
 */
async function bootAddRouteAndCheck(
    cwd: string,
    port: number
): Promise<number> {
    const proc = Bun.spawn(
        ['bun', 'run', 'dev', '--', '--port', String(port)],
        { cwd, stdout: 'pipe', stderr: 'pipe', ...treeKillSpawnOptions() }
    );
    const outReader = new Response(proc.stdout).text();
    const errReader = new Response(proc.stderr).text();

    // Poll for 200, not just any response — the transient 404 before the
    // watcher's restart lands is exactly the case under test.
    const waitFor = async (
        path: string,
        deadlineMs: number
    ): Promise<number> => {
        const deadline = Date.now() + deadlineMs;
        let lastStatus = -1;
        while (Date.now() < deadline) {
            try {
                const res = await fetch(`http://127.0.0.1:${port}${path}`);
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
        await mkdir(routeDir, { recursive: true });
        await writeFile(
            join(routeDir, 'route.ts'),
            'export const GET = () => Response.json({ fresh: true });\n'
        );
        finalStatus = await waitFor('/api/brand-new-route', 20_000);
    }

    await killTree(proc);
    await outReader;
    await errReader;
    return finalStatus;
}

afterAll(cleanupProjects);

describe('E2E scaffold — TypeScript', () => {
    it(
        'create → dev boot → build → start, all serving GET /api',
        async () => {
            const dir = await scaffoldProject('e2e-ts');

            // dev server boots and serves the route
            const dev = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'dev'
            );
            expect(dev.status).toBe(200);

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
            const start = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'start'
            );
            expect(start.status).toBe(200);
        },
        E2E_TIMEOUT
    );

    it(
        'dev picks up a brand-new route directory without a manual restart',
        async () => {
            const dir = await scaffoldProject('e2e-newroute');
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
            // Regression: config.ts's default export must reach the route
            // unwrapped in production builds, not as a raw module namespace
            // ({ default: {...} }). The hook makes that visible in the body.
            const dir = await scaffoldProject('e2e-config');
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

            const dev = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'dev',
                '/api/gate'
            );
            expect(dev.status).toBe(200);
            expect(dev.body).toEqual({ gated: false });

            const build = await run(['bun', 'run', 'build'], dir);
            expect(build.code).toBe(0);

            const prod = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'start',
                '/api/gate'
            );
            expect(prod.status).toBe(200);
            // Regression: production must also see config.ts's unwrapped
            // default export.
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
            const dir = await scaffoldProject('e2e-js', { lang: 'js' });

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
            // defineRoute types ctx.validated from schema.js without a
            // JSDoc annotation.
            expect(route).toContain('defineRoute(GetSchema, (ctx) =>');
            expect(existsSync(join(dir, 'src', 'openapi.config.js'))).toBe(
                true
            );
            expect(existsSync(join(dir, 'burger.build.js'))).toBe(true);

            // Scripts point at the .js entry (dev/start auto-detect it)
            const pkg = JSON.parse(
                await readFile(join(dir, 'package.json'), 'utf8')
            );
            expect(pkg.scripts.dev).toBe('burger-api dev');
            expect(pkg.scripts.start).toBe('burger-api start');
            expect(pkg.scripts.build).toBe('burger-api build src/index.js');

            // dev server boots and serves the .js route
            const dev = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'dev'
            );
            expect(dev.status).toBe(200);

            // build produces the AOT bundle including the .js route
            const build = await run(['bun', 'run', 'build'], dir);
            expect(build.code).toBe(0);
            expect(existsSync(join(dir, '.build', 'bundle', 'app.js'))).toBe(
                true
            );

            // production start serves the route
            const start = await bootAndCheck(
                dir,
                await getAvailablePort(),
                'start'
            );
            expect(start.status).toBe(200);
        },
        E2E_TIMEOUT
    );
});
