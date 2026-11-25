/**
 * A failed `build --target=node` preflight must not destroy the previous
 * production bundle, and `start` without a bundle warns that it runs sources.
 *
 * Bun.resolveSync falls back to the global install cache, which may already
 * contain @burger-api/node-server on a developer machine. The build test runs
 * the command in-process and stubs only that lookup, so the missing-package
 * preflight stays deterministic and offline.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildCommand } from '../src/commands/build';
import {
    getAvailablePort,
    makeTempDir,
    removeDir,
    runCli,
    runCommandInProcess,
} from './test-utils';

let dir = '';
let originalResolveSync: typeof Bun.resolveSync;

beforeEach(() => {
    dir = makeTempDir('burger-node-preflight-');
    originalResolveSync = Bun.resolveSync;
});

afterEach(() => {
    Bun.resolveSync = originalResolveSync;
    removeDir(dir);
});

describe('build --target=node preflight', () => {
    it('keeps the existing bundle when @burger-api/node-server is missing', async () => {
        await Bun.write(
            join(dir, 'package.json'),
            JSON.stringify({ name: 'node-preflight-test' })
        );
        await Bun.write(
            join(dir, 'src', 'index.ts'),
            [
                "import { Burger } from 'burger-api';",
                "const app = new Burger({ apiDir: './src/api' });",
                'app.serve(4000);',
            ].join('\n')
        );
        await Bun.write(
            join(dir, 'src', 'api', 'hello', 'route.ts'),
            'export const GET = () => Response.json({ ok: true });\n'
        );
        const bundle = join(dir, '.build', 'bundle', 'app.js');
        const previous = "console.log('previous-build');\n";
        await Bun.write(bundle, previous);

        Bun.resolveSync = ((specifier: string, parent: string) => {
            if (specifier === '@burger-api/node-server') {
                throw new Error('Cannot find module');
            }
            return originalResolveSync(specifier, parent);
        }) as typeof Bun.resolveSync;

        const result = await runCommandInProcess(
            buildCommand,
            ['src/index.ts', '--target=node'],
            dir
        );

        expect(result.exitCode).not.toBeNull();
        expect(result.exitCode).not.toBe(0);
        expect(result.output).toContain('"@burger-api/node-server"');
        expect(result.output).toContain('bun add @burger-api/node-server');
        expect(existsSync(bundle)).toBe(true);
        expect(readFileSync(bundle, 'utf8')).toBe(previous);
    });
});

describe('start without a production build', () => {
    it('warns that it runs the source entry', async () => {
        await Bun.write(
            join(dir, 'src', 'index.ts'),
            "console.log('source-entry-booted');\n"
        );

        const port = await getAvailablePort();
        const result = await runCli(['start', '--port', String(port)], {
            cwd: dir,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('source-entry-booted');
        expect(result.stdout).toContain(
            'No production build found, running src/index.ts from source. Run "burger-api build" first for production.'
        );
    });
});
