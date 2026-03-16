/**
 * Validates that built bundle runs and responds (no runtime fs scan).
 * Run after building the file-base-api-routing example:
 *   cd packages/burger-api/examples/file-base-api-routing
 *   bun run ../../../cli/src/index.ts build src/index.ts --outfile .build/bundle/app.js
 *   bun test ../../../cli/test/build-output.test.ts
 *
 * Or run from repo root with BUILD_BUNDLE_PATH set to the app.js path.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { getAvailablePort } from './test-utils';

let baseUrl = '';
const REQUIRE_BUNDLE =
    process.env.REQUIRE_BUILD_BUNDLE === 'true' || process.env.CI === 'true';
const BUNDLE_PATH =
    process.env.BUILD_BUNDLE_PATH ||
    join(
        import.meta.dir,
        '..',
        '..',
        'burger-api',
        'examples',
        'file-base-api-routing',
        '.build',
        'bundle',
        'app.js'
    );

let serverProc: ReturnType<typeof spawn> | null = null;

beforeAll(async () => {
    const bundlePath = join(BUNDLE_PATH);
    if (!existsSync(bundlePath)) {
        if (REQUIRE_BUNDLE) {
            throw new Error(
                `Build output test requires bundle, but none was found at: ${bundlePath}`
            );
        }
        console.warn(
            'Skipping build-output tests: bundle not found at',
            bundlePath
        );
        return;
    }
    const port = await getAvailablePort();
    baseUrl = `http://localhost:${port}`;
    serverProc = spawn('bun', [bundlePath as string], {
        env: { ...process.env, PORT: String(port) },
        stdio: 'pipe',
    });
    await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => resolve(), 2000);
        serverProc!.stdout?.on('data', (d: Buffer) => {
            if (d.toString().includes('Server running')) {
                clearTimeout(t);
                resolve();
            }
        });
        serverProc!.stderr?.on('data', () => {});
        serverProc!.on('error', reject);
    });
}, 10000);

afterAll(() => {
    if (serverProc) {
        serverProc.kill();
    }
});

describe('Build output (AOT routes)', () => {
    it('responds to GET /api/products without runtime filesystem scan', async () => {
        const bundlePath = join(BUNDLE_PATH);
        if (!existsSync(bundlePath)) {
            // Local convenience mode only; CI path fails in beforeAll.
            expect(REQUIRE_BUNDLE).toBe(false);
            return;
        }
        const res = await fetch(`${baseUrl}/api/products`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('name');
    });
});
