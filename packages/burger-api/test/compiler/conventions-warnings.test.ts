import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Burger } from '../../src/index';
import { DirectoryScanner } from '../../src/compiler/scanner';

/**
 * Convention files in a folder without a `route.ts` apply to nothing —
 * nothing is inherited by child routes, so the scanner warns (once per
 * folder) instead of silently ignoring them.
 */

const spies: { mockRestore(): void }[] = [];

afterEach(() => {
    while (spies.length) spies.pop()!.mockRestore();
});

function captureWarnings(): string[] {
    const messages: string[] = [];
    spies.push(
        spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
            messages.push(args.map(String).join(' '));
        })
    );
    return messages;
}

function makeRoot(): string {
    return mkdtempSync(path.join(tmpdir(), 'burger-conv-warn-'));
}

function write(root: string, rel: string, contents = 'export {};'): void {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
}

describe('DirectoryScanner — convention files without route.ts', () => {
    it('warns once for a group folder and still serves its child route', async () => {
        const root = makeRoot();
        const previousAppDir = process.env.BURGER_API_APP_DIR;
        write(root, 'api/(auth)/hooks.ts');
        write(root, 'api/(auth)/config.ts', 'export default {};');
        write(
            root,
            'api/(auth)/me/route.ts',
            `export const GET = () => Response.json({ me: true });`
        );
        const warnings = captureWarnings();
        process.env.BURGER_API_APP_DIR = root;
        try {
            const burger = new Burger({});
            const handler = await burger.fetchHandler();

            const res = await handler(new Request('http://localhost/api/me'));
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ me: true });

            const ours = warnings.filter(
                (m) => m.includes('[burger-api]') && m.includes('(auth)')
            );
            expect(ours).toHaveLength(1);
            const warning = ours[0] ?? '';
            expect(warning).toContain('(auth) has');
            expect(warning).toContain('hooks.ts');
            expect(warning).toContain('config.ts');
            expect(warning).toContain(
                'but no route.ts, so they apply to nothing'
            );
            expect(warning).toContain(
                'Convention files are not inherited by child routes'
            );
        } finally {
            if (previousAppDir === undefined) delete process.env.BURGER_API_APP_DIR;
            else process.env.BURGER_API_APP_DIR = previousAppDir;
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not warn when route.ts sits next to the convention files', async () => {
        const root = makeRoot();
        write(root, 'api/users/route.ts');
        write(root, 'api/users/hooks.ts');
        write(root, 'api/users/config.ts', 'export default {};');
        const warnings = captureWarnings();
        try {
            const result = await new DirectoryScanner(
                path.join(root, 'api')
            ).scan();
            expect(result.routes).toHaveLength(1);
            expect(
                warnings.filter((m) => m.includes('[burger-api]'))
            ).toHaveLength(0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('never warns for app-root convention files outside the scan dir', async () => {
        const root = makeRoot();
        write(root, 'api/users/route.ts');
        write(root, 'hooks.ts');
        write(root, 'plugins.ts', 'export default function () {}');
        write(root, 'providers.ts', 'export default function () {}');
        write(root, 'openapi.config.ts', 'export default {};');
        const warnings = captureWarnings();
        try {
            const result = await new DirectoryScanner(
                path.join(root, 'api')
            ).scan();
            expect(result.routes).toHaveLength(1);
            expect(result.globalHooks).toContain('hooks.ts');
            expect(
                warnings.filter((m) => m.includes('[burger-api]'))
            ).toHaveLength(0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
