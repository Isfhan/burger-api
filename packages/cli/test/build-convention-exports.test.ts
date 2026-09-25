import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import { getAvailablePort } from './test-utils';

/**
 * Regression (critical): a production build must wire convention exports
 * exactly like dev, whatever syntax they use. The build once regex-guessed
 * exports from source text, so a typed hook
 * (`export const beforeRoute: X = [...]`) or a destructured one
 * (`export const { beforeRoute } = ...`) was silently dropped — auth hooks
 * were bypassed in production while dev enforced them.
 */
const DIR = join(import.meta.dir, '__tmp_build_convention_exports');
const OUTFILE = '.build/bundle/app.js';

const DENY = "() => new Response('denied', { status: 401 })";

const FILES: Record<string, string> = {
    'src/index.ts': [
        "import { Burger } from 'burger-api';",
        "const app = new Burger({ apiDir: './src/api' });",
        'app.serve(Number(process.env.PORT) || 4000);',
    ].join('\n'),
    // Typed hook export (documented style)
    'src/api/typed/route.ts':
        'export async function GET() { return Response.json({ ok: true }); }',
    'src/api/typed/hooks.ts': [
        "import type { BurgerContext } from 'burger-api';",
        'type Hook = (ctx: BurgerContext) => Response | void;',
        `export const beforeRoute: Hook[] = [${DENY}];`,
    ].join('\n'),
    // Destructured hook export
    'src/api/destructured/route.ts':
        'export async function GET() { return Response.json({ ok: true }); }',
    'src/api/destructured/hooks.ts': `export const { beforeRoute } = { beforeRoute: [${DENY}] };`,
    // Default-exported hooks object
    'src/api/default-hooks/route.ts':
        'export async function GET() { return Response.json({ ok: true }); }',
    'src/api/default-hooks/hooks.ts': `export default { beforeRoute: [${DENY}] };`,
    // Annotated method + `export { POST }` block
    'src/api/annotated/route.ts': [
        'type H = () => Response;',
        "export const GET: H = () => Response.json({ via: 'annotated' });",
        "const POST = () => Response.json({ via: 'block' });",
        'export { POST };',
    ].join('\n'),
    // App-level hooks in a JS file next to the entry
    'src/hooks.js': [
        'export const onRequest = [',
        '    (ctx) => {',
        "        if (ctx.request.headers.get('x-block') === '1') {",
        "            return new Response('blocked globally', { status: 418 });",
        '        }',
        '    },',
        '];',
    ].join('\n'),
};

let baseUrl = '';
let serverProc: ReturnType<typeof spawn> | null = null;

beforeAll(async () => {
    rmSync(DIR, { recursive: true, force: true });
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
    });
    for (let i = 0; i < 50; i++) {
        try {
            await fetch(`${baseUrl}/api/annotated`);
            break;
        } catch {
            await Bun.sleep(100);
        }
    }
}, 60_000);

afterAll(async () => {
    const proc = serverProc;
    if (proc && proc.exitCode === null) {
        // Wait for the child to fully exit before deleting its directory —
        // on Windows a just-killed process still holds the bundle open for
        // a moment (EBUSY on rm).
        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                try {
                    proc.kill('SIGKILL');
                } catch {
                    // already gone
                }
                resolve();
            }, 5000);
            proc.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
            proc.kill();
        });
    }
    for (let i = 0; i < 10; i++) {
        try {
            rmSync(DIR, { recursive: true, force: true });
            return;
        } catch {
            await Bun.sleep(200);
        }
    }
}, 30_000);

describe('production build wires convention exports of any syntax', () => {
    it('typed `export const beforeRoute: X = [...]` runs in production', async () => {
        const res = await fetch(`${baseUrl}/api/typed`);
        expect(res.status).toBe(401);
    });

    it('destructured `export const { beforeRoute } = ...` runs in production', async () => {
        const res = await fetch(`${baseUrl}/api/destructured`);
        expect(res.status).toBe(401);
    });

    it('a default-exported hooks object runs in production (like dev)', async () => {
        const res = await fetch(`${baseUrl}/api/default-hooks`);
        expect(res.status).toBe(401);
    });

    it('annotated method exports and `export { POST }` are served', async () => {
        const get = await fetch(`${baseUrl}/api/annotated`);
        expect(await get.json()).toEqual({ via: 'annotated' });
        const post = await fetch(`${baseUrl}/api/annotated`, { method: 'POST' });
        expect(await post.json()).toEqual({ via: 'block' });
    });

    it('app-level src/hooks.js (JS project) reaches the bundle', async () => {
        const res = await fetch(`${baseUrl}/api/annotated`, {
            headers: { 'x-block': '1' },
        });
        expect(res.status).toBe(418);
    });
});
