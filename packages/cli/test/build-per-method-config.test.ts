import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import {
    getAvailablePort,
    killTree,
    makeTempDir,
    removeDir,
    treeKillSpawnOptions,
    waitForServer,
} from './test-utils';

/**
 * Regression: per-method `config.ts` exports (default-route-wide + uppercase
 * method overrides) must resolve per method in production builds, exactly as
 * in dev live scanning.
 */
const BURGER_API_PKG = resolve(import.meta.dir, '..', '..', 'burger-api');
const OUTFILE = '.build/bundle/app.js';
let DIR = '';
let baseUrl = '';
let serverProc: ReturnType<typeof spawn> | null = null;

/** The temp project lives outside the repo, so link the local package in. */
function linkBurgerApi(dir: string): void {
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    symlinkSync(
        BURGER_API_PKG,
        join(dir, 'node_modules', 'burger-api'),
        process.platform === 'win32' ? 'junction' : 'dir'
    );
}

const FILES: Record<string, string> = {
    'src/index.ts': [
        "import { Burger } from 'burger-api';",
        "const app = new Burger({ apiDir: './src/api' });",
        'app.serve(Number(process.env.PORT) || 4000);',
    ].join('\n'),
    'src/plugins.ts': [
        "import type { PluginRegistrar } from 'burger-api';",
        '',
        '// Default-deny auth: public only when config.ts disables it.',
        'export default (burger: PluginRegistrar) => {',
        '    burger.usePlugin({',
        "        name: 'test-auth',",
        '        hooks: {',
        '            beforeRoute: (ctx) => {',
        '                const config = ctx.config as',
        '                    | { auth?: boolean | { required?: boolean } }',
        '                    | undefined;',
        '                if (',
        '                    config?.auth === false ||',
        '                    (typeof config?.auth === "object" &&',
        '                        config.auth.required === false)',
        '                )',
        '                    return;',
        "                return new Response('unauthorized', { status: 401 });",
        '            },',
        '        },',
        '    });',
        '};',
    ].join('\n'),
    'src/api/mixed/route.ts': [
        'export function GET() {',
        "    return Response.json({ ok: 'get' });",
        '}',
        'export function POST() {',
        "    return Response.json({ ok: 'post' });",
        '}',
    ].join('\n'),
    // Default: public. POST override: protected.
    'src/api/mixed/config.ts': [
        'export default { auth: false };',
        'export const POST = { auth: { required: true } };',
    ].join('\n'),
};

beforeAll(async () => {
    DIR = makeTempDir('burger-per-method-config-');
    linkBurgerApi(DIR);
    for (const [rel, content] of Object.entries(FILES)) {
        const full = join(DIR, rel);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
    }

    const result = await runVirtualEntryBuild({
        cwd: DIR,
        entryFile: 'src/index.ts',
        outfile: OUTFILE,
        target: 'bun',
    });
    expect(result.success).toBe(true);
    expect(existsSync(join(DIR, OUTFILE))).toBe(true);

    const port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProc = spawn('bun', [join(DIR, OUTFILE)], {
        env: { ...process.env, PORT: String(port) },
        stdio: 'pipe',
        ...treeKillSpawnOptions(),
    });
    serverProc.on('error', () => {
        // waitForServer below fails loud when the process never serves.
    });
    await waitForServer(`${baseUrl}/api/mixed`, 15_000);
}, 60_000);

afterAll(async () => {
    if (serverProc) await killTree(serverProc);
    if (DIR) removeDir(DIR);
}, 30_000);

describe('production build: per-method config.ts', () => {
    it('serves GET publicly (default config)', async () => {
        const res = await fetch(`${baseUrl}/api/mixed`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: 'get' });
    });

    it('rejects POST (method override is protected)', async () => {
        const res = await fetch(`${baseUrl}/api/mixed`, { method: 'POST' });
        expect(res.status).toBe(401);
    });
});
