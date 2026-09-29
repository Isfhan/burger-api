/**
 * Runs the built bundle and checks it responds (no runtime fs scan).
 * Set BUILD_BUNDLE_PATH, or build the production-app example first:
 *   cd packages/burger-api/examples/production-app
 *   bun run ../../../cli/src/index.ts build src/index.ts --outfile .build/bundle/app.js
 *
 * Missing bundle: skipped locally, hard failure when
 * REQUIRE_BUILD_BUNDLE=true or CI=true.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { getAvailablePort, killTree, waitForServer } from './test-utils';

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
        'production-app',
        '.build',
        'bundle',
        'app.js'
    );
const HAS_BUNDLE = existsSync(BUNDLE_PATH);

let serverProc: ReturnType<typeof spawn> | null = null;

describe.skipIf(!HAS_BUNDLE && !REQUIRE_BUNDLE)(
    'Build output (AOT routes)',
    () => {
        beforeAll(async () => {
            if (!HAS_BUNDLE) {
                throw new Error(
                    `Build output test requires bundle, but none was found at: ${BUNDLE_PATH}`
                );
            }
            const port = await getAvailablePort();
            baseUrl = `http://127.0.0.1:${port}`;
            serverProc = spawn('bun', [BUNDLE_PATH as string], {
                env: { ...process.env, PORT: String(port) },
                stdio: 'pipe',
            });
            serverProc.stderr?.on('data', () => {});
            serverProc.on('error', () => {
                // waitForServer below fails loud when the process never serves.
            });
            await waitForServer(baseUrl, 15_000);
        }, 20000);

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
    }
);