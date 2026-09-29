import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import { getAvailablePort, killTree, removeDir, waitForServer } from './test-utils';

/**
 * Regression: file-based WebSocket routes (src/websocket/ws.ts) must be
 * embedded in production builds, not dropped by the virtual entry.
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
        removeDir(outDir);
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

    serverProc.on('error', () => {
        // waitForServer below fails loud when the process never serves.
    });
    await waitForServer(`${baseUrl}/api`, 15_000);
}, 30000);

afterAll(async () => {
    if (serverProc) {
        await killTree(serverProc);
    }
    const outDir = join(FIXTURE_DIR, '.build');
    if (existsSync(outDir)) {
        removeDir(outDir);
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
