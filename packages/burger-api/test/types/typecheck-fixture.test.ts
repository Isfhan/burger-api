/**
 * Runs `tsc --noEmit` over a sample app fixture so public type regressions
 * (augmentation, RouteConfig, ws.user) fail the suite, not only `typecheck`.
 */
import { describe, it, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

const tscPath = path.join(
    import.meta.dir,
    '../../node_modules/typescript/bin/tsc'
);
const fixtureTsconfig = path.join(
    import.meta.dir,
    '../fixtures/types-app/tsconfig.json'
);
const hasTsc = existsSync(tscPath) && existsSync(fixtureTsconfig);

describe('public type augmentation (tsc fixture)', () => {
    it.skipIf(!hasTsc)(
        'user + ecosystem augmentations, RouteConfig and ws.user compile',
        () => {
            const result = Bun.spawnSync({
                cmd: [
                    process.execPath,
                    tscPath,
                    '--noEmit',
                    '-p',
                    fixtureTsconfig,
                ],
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const output =
                result.stdout.toString() + result.stderr.toString();
            expect(output).toBe('');
            expect(result.exitCode).toBe(0);
        },
        60000
    );
});
