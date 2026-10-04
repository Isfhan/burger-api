/**
 * Runs the built bundle and checks it responds (no runtime fs scan).
 *
 * When the bundle is missing it is built here, offline, from the
 * production-app example (same build command as the CI workflow): the
 * example is copied to a temp dir with the local `burger-api` linked, so
 * the file runs locally and in CI without any setup. Set BUILD_BUNDLE_PATH
 * to point at a different bundle (built on demand there too).
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';
import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    symlinkSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import {
    getAvailablePort,
    killTree,
    makeTempDir,
    removeDir,
    runCli,
    treeKillSpawnOptions,
    waitForServer,
} from './test-utils';

const EXAMPLE_DIR = resolve(
    import.meta.dir,
    '..',
    '..',
    'burger-api',
    'examples',
    'production-app'
);
const BURGER_API_PKG = resolve(import.meta.dir, '..', '..', 'burger-api');
const BUNDLE_PATH = resolve(
    process.env.BUILD_BUNDLE_PATH ||
        join(EXAMPLE_DIR, '.build', 'bundle', 'app.js')
);

/**
 * Builds the example bundle without touching the example's node_modules:
 * copies the example sources to a temp project, links the local package in,
 * runs the CLI build there (default outfile, so the generated entry sits
 * inside the project and resolves modules), then copies the bundle out.
 */
async function buildExampleBundle(): Promise<void> {
    const project = makeTempDir('burger-build-output-');
    try {
        cpSync(join(EXAMPLE_DIR, 'src'), join(project, 'src'), {
            recursive: true,
        });
        cpSync(
            join(EXAMPLE_DIR, 'package.json'),
            join(project, 'package.json')
        );
        mkdirSync(join(project, 'node_modules'), { recursive: true });
        symlinkSync(
            BURGER_API_PKG,
            join(project, 'node_modules', 'burger-api'),
            process.platform === 'win32' ? 'junction' : 'dir'
        );

        const build = await runCli(['build', 'src/index.ts'], {
            cwd: project,
        });
        const built = join(project, '.build', 'bundle', 'app.js');
        if (build.exitCode !== 0 || !existsSync(built)) {
            throw new Error(
                `Could not build the example bundle (exit ${build.exitCode}).\n` +
                    build.stdout +
                    '\n' +
                    build.stderr
            );
        }

        mkdirSync(dirname(BUNDLE_PATH), { recursive: true });
        copyFileSync(built, BUNDLE_PATH);
    } finally {
        removeDir(project);
    }
}

let baseUrl = '';
let serverProc: ReturnType<typeof spawn> | null = null;

describe('Build output (AOT routes)', () => {
    beforeAll(async () => {
        if (!existsSync(BUNDLE_PATH)) {
            await buildExampleBundle();
        }
        const port = await getAvailablePort();
        baseUrl = `http://127.0.0.1:${port}`;
        serverProc = spawn('bun', [BUNDLE_PATH], {
            env: { ...process.env, PORT: String(port) },
            stdio: 'pipe',
            ...treeKillSpawnOptions(),
        });
        serverProc.stderr?.on('data', () => {});
        serverProc.on('error', () => {
            // waitForServer below fails loud when the process never serves.
        });
        await waitForServer(baseUrl, 15_000);
    }, 120_000);

    afterAll(async () => {
        if (serverProc) {
            await killTree(serverProc);
        }
    });

    it('responds to GET /api without runtime filesystem scan', async () => {
        const res = await fetch(`${baseUrl}/api`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('message');
    });
});
