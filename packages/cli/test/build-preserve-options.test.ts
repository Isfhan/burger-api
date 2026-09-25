import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import { getAvailablePort } from './test-utils';

const FIXTURE_DIR = join(import.meta.dir, 'fixtures', 'preserve-options');
const OUTFILE = '.build/bundle/app.js';
const BUNDLE_PATH = join(FIXTURE_DIR, OUTFILE);

let baseUrl = '';
let serverProc: ReturnType<typeof spawn> | null = null;

beforeAll(async () => {
    const outDir = join(FIXTURE_DIR, '.build');
    if (existsSync(outDir)) {
        rmSync(outDir, { recursive: true, force: true });
    }

    const result = await runVirtualEntryBuild({
        cwd: FIXTURE_DIR,
        entryFile: 'src/index.ts',
        outfile: OUTFILE,
        target: 'bun',
    });

    expect(result.success).toBe(true);
    expect(existsSync(BUNDLE_PATH)).toBe(true);

    const port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProc = spawn('bun', [BUNDLE_PATH], {
        env: { ...process.env, PORT: String(port) },
        stdio: 'pipe',
    });

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 2500);

        serverProc!.stdout?.on('data', (d: Buffer) => {
            const out = d.toString();
            if (out.includes('Server running on http://localhost:')) {
                clearTimeout(timeout);
                resolve();
            }
        });

        serverProc!.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}, 30000);

afterAll(async () => {
    if (serverProc) {
        const proc = serverProc;
        await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                resolve();
            };
            proc.once('exit', finish);
            proc.kill();
            setTimeout(finish, 1000);
        });
    }
    const outDir = join(FIXTURE_DIR, '.build');
    if (existsSync(outDir)) {
        try {
            rmSync(outDir, { recursive: true, force: true });
        } catch (err) {
            const code = (err as { code?: string })?.code;
            if (code !== 'EBUSY') {
                throw err;
            }
        }
    }
});

describe('Build integration: preserve user Burger options', () => {
    it('keeps route hooks (api/hooks.ts) in the built output', async () => {
        const res = await fetch(`${baseUrl}/api`);
        expect(res.status).toBe(418);
        expect(await res.text()).toContain('blocked by global hooks');
    });
});
