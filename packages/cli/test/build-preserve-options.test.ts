import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { runVirtualEntryBuild } from '../src/utils/build/pipeline';
import {
    getAvailablePort,
    killTree,
    removeDir,
    treeKillSpawnOptions,
    waitForServer,
} from './test-utils';

const FIXTURE_DIR = join(import.meta.dir, 'fixtures', 'preserve-options');
const OUTFILE = '.build/bundle/app.js';
const BUNDLE_PATH = join(FIXTURE_DIR, OUTFILE);

let baseUrl = '';
let serverProc: ReturnType<typeof spawn> | null = null;

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
        ...treeKillSpawnOptions(),
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

describe('Build integration: preserve user Burger options', () => {
    it('keeps route hooks (api/hooks.ts) in the built output', async () => {
        const res = await fetch(`${baseUrl}/api`);
        expect(res.status).toBe(418);
        expect(await res.text()).toContain('blocked by global hooks');
    });

    it('keeps constructor options (title, version) in the built output', async () => {
        const res = await fetch(`${baseUrl}/openapi.json`);
        expect(res.status).toBe(200);
        const doc = (await res.json()) as {
            info: { title: string; version: string };
        };
        expect(doc.info.title).toBe('Preserve Options Test');
        expect(doc.info.version).toBe('9.9.9');
    });
});
