import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import { getAvailablePort } from './test-utils';

/**
 * Regression: file-based WebSocket routes (src/websocket/ws.ts files) must be
 * embedded in production builds. Previously the virtual entry only imported
 * api/page routes, silently dropping every ws.ts route from `burger-api build`
 * output (they only existed in the dev filesystem scan).
 */
const FIXTURE_DIR = join(import.meta.dir, 'fixtures', 'ws-app');
const OUTFILE = '.build/bundle/app.js';
const BUNDLE_PATH = join(FIXTURE_DIR, OUTFILE);

let baseUrl = '';
let serverProc: ReturnType<typeof spawn> | null = null;

function waitForOpen(ws: WebSocket, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('WebSocket open timed out')),
            timeoutMs
        );
        ws.onopen = () => {
            clearTimeout(timer);
            resolve();
        };
    });
}

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('WebSocket message timed out')),
            timeoutMs
        );
        ws.onmessage = (event) => {
            clearTimeout(timer);
            resolve(
                typeof event.data === 'string'
                    ? event.data
                    : event.data.toString()
            );
        };
    });
}

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

describe('Build integration: WebSocket routes in production bundles', () => {
    it('serves HTTP routes from the same bundle', async () => {
        const res = await fetch(`${baseUrl}/api`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });

    it('serves file-based ws.ts routes (echo) from the built bundle', async () => {
        const ws = new WebSocket(
            baseUrl.replace('http', 'ws') + '/chat'
        );
        await waitForOpen(ws);

        const connected = JSON.parse(await waitForMessage(ws));
        expect(connected.type).toBe('connected');

        ws.send('hello from built bundle');
        const echo = JSON.parse(await waitForMessage(ws));
        expect(echo.type).toBe('echo');
        expect(echo.data).toBe('hello from built bundle');

        ws.close();
    });
});
