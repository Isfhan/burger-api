import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DirectoryScanner } from '../../src/compiler/scanner';
import { CONVENTION_FILES } from '../../src/compiler/conventions';
import type { ScannedRoute } from '../../src/compiler/route-module';

/**
 * Tests for the Directory Scanner: pure filesystem inventory, convention
 * validation, dynamic/wildcard conflict detection, and `middleware.ts` rejection.
 * Each route directory is self-contained — no group inheritance chain.
 */

function makeTree(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
    const write = (rel: string, contents = 'export {};') => {
        const full = path.join(root, rel);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, contents);
    };
    // api/users/route.ts + config.ts + schema.ts (self-contained)
    write('users/route.ts');
    write('users/schema.ts');
    write('users/config.ts', `export default { auth: false };`);
    // api/dashboard/route.ts (inside (admin) group — URL stripped, no inheritance)
    write('(admin)/dashboard/route.ts');
    // api/posts/[id]/route.ts (dynamic)
    write('posts/[id]/route.ts');
    // api/files/[...]/route.ts (wildcard)
    write('files/[...]/route.ts');
    // group-only folder with no route.ts (should not emit a ScannedRoute)
    write('(shared)/hooks.ts');
    return root;
}

describe('DirectoryScanner — inventory', () => {
    let root: string;
    let routes: ScannedRoute[];

    beforeEach(async () => {
        root = makeTree();
        const scanner = new DirectoryScanner(root, 'api');
        const result = await scanner.scan();
        routes = result.routes;
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('emits one ScannedRoute per directory containing route.ts', () => {
        const paths = routes.map((r) => r.routePath).sort();
        expect(paths).toEqual([
            '/api/dashboard',
            '/api/files/*',
            '/api/posts/:id',
            '/api/users',
        ]);
    });

    it('does not emit a route for group-only folders (no route.ts)', () => {
        expect(routes.some((r) => r.routePath.includes('shared'))).toBe(false);
    });

    it('records local convention files', () => {
        const users = routes.find((r) => r.routePath === '/api/users')!;
        expect(users.localFiles.route).toBeDefined();
        expect(users.localFiles.schema).toBeDefined();
        expect(users.localFiles.config).toBeDefined();
        expect(users.localFiles.hooks).toBeUndefined();
    });

    it('marks wildcard routes', () => {
        const wildcard = routes.find((r) => r.routePath === '/api/files/*')!;
        expect(wildcard.isWildcard).toBe(true);
        const dynamic = routes.find((r) => r.routePath === '/api/posts/:id')!;
        expect(dynamic.isWildcard).toBe(false);
    });

    it('groups only affect URL path (no inheritance chain)', () => {
        const dashboard = routes.find((r) => r.routePath === '/api/dashboard')!;
        // (admin) group is stripped from URL — route path is /api/dashboard
        expect(dashboard.routePath).toBe('/api/dashboard');
        // No groupFiles or groupChain — self-contained
        expect(dashboard).not.toHaveProperty('groupFiles');
        expect(dashboard).not.toHaveProperty('groupChain');
    });

    it('discovers config.ts as a local convention file', () => {
        const users = routes.find((r) => r.routePath === '/api/users')!;
        expect(users.localFiles.config).toBeDefined();
        expect(users.localFiles.config).toContain('config.ts');
    });
});

describe('DirectoryScanner — convention validation', () => {
    it('rejects middleware.ts (forbidden file)', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'users'), { recursive: true });
            writeFileSync(path.join(root, 'users', 'route.ts'), 'export {};');
            writeFileSync(
                path.join(root, 'users', 'middleware.ts'),
                'export {};'
            );
            const scanner = new DirectoryScanner(root, 'api');
            await expect(scanner.scan()).rejects.toThrow(/middleware/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects middleware.js too (forbidden across extensions)', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'users'), { recursive: true });
            writeFileSync(path.join(root, 'users', 'route.js'), 'export {};');
            writeFileSync(path.join(root, 'users', 'middleware.js'), 'export {};');
            const scanner = new DirectoryScanner(root, 'api');
            await expect(scanner.scan()).rejects.toThrow(/middleware/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('detects mixed dynamic + wildcard folders at one level', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'x', '[id]'), { recursive: true });
            mkdirSync(path.join(root, 'x', '[...]'), { recursive: true });
            writeFileSync(
                path.join(root, 'x', '[id]', 'route.ts'),
                'export {};'
            );
            const scanner = new DirectoryScanner(root, 'api');
            await expect(scanner.scan()).rejects.toThrow(
                /dynamic and wildcard/
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('DirectoryScanner — JavaScript (.js / .mjs)', () => {
    it('discovers route.js with its .js convention siblings', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'users'), { recursive: true });
            writeFileSync(path.join(root, 'users', 'route.js'), 'export {};');
            writeFileSync(path.join(root, 'users', 'schema.js'), 'export {};');
            writeFileSync(
                path.join(root, 'users', 'config.js'),
                'export default { auth: false };'
            );
            const scanner = new DirectoryScanner(root, 'api');
            const result = await scanner.scan();

            expect(result.routes).toHaveLength(1);
            const users = result.routes[0]!;
            expect(users.routePath).toBe('/api/users');
            expect(users.localFiles.route).toContain('route.js');
            expect(users.localFiles.schema).toContain('schema.js');
            expect(users.localFiles.config).toContain('config.js');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('discovers route.mjs', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'm'), { recursive: true });
            writeFileSync(path.join(root, 'm', 'route.mjs'), 'export {};');
            const scanner = new DirectoryScanner(root, 'api');
            const result = await scanner.scan();
            expect(result.routes[0]?.routePath).toBe('/api/m');
            expect(result.routes[0]?.localFiles.route).toContain('route.mjs');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('throws when route.ts and route.js coexist in the same directory', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'users'), { recursive: true });
            writeFileSync(path.join(root, 'users', 'route.ts'), 'export {};');
            writeFileSync(path.join(root, 'users', 'route.js'), 'export {};');
            const scanner = new DirectoryScanner(root, 'api');
            await expect(scanner.scan()).rejects.toThrow(/Conflicting/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('throws when schema.ts and schema.js coexist', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'users'), { recursive: true });
            writeFileSync(path.join(root, 'users', 'route.ts'), 'export {};');
            writeFileSync(path.join(root, 'users', 'schema.ts'), 'export {};');
            writeFileSync(path.join(root, 'users', 'schema.js'), 'export {};');
            const scanner = new DirectoryScanner(root, 'api');
            await expect(scanner.scan()).rejects.toThrow(/Conflicting/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('detects app-level hooks.js / plugins.mjs at the routes parent', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'api', 'users'), { recursive: true });
            writeFileSync(
                path.join(root, 'api', 'users', 'route.js'),
                'export {};'
            );
            writeFileSync(path.join(root, 'hooks.js'), 'export {};');
            writeFileSync(path.join(root, 'plugins.mjs'), 'export {};');
            const scanner = new DirectoryScanner(path.join(root, 'api'));
            const result = await scanner.scan();

            expect(result.globalHooks).toContain('hooks.js');
            expect(result.pluginsPath).toContain('plugins.mjs');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('throws on conflicting app-level hooks.ts + hooks.js', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'api', 'users'), { recursive: true });
            writeFileSync(
                path.join(root, 'api', 'users', 'route.ts'),
                'export {};'
            );
            writeFileSync(path.join(root, 'hooks.ts'), 'export {};');
            writeFileSync(path.join(root, 'hooks.js'), 'export {};');
            const scanner = new DirectoryScanner(path.join(root, 'api'));
            await expect(scanner.scan()).rejects.toThrow(/Conflicting/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('DirectoryScanner — recognized conventions', () => {
    it('exposes the canonical convention file list (vision-aligned)', () => {
        expect([...CONVENTION_FILES].sort()).toEqual(
            ['config', 'hooks', 'openapi', 'route', 'schema'].sort()
        );
    });

    it('does not include use or webhook in convention files', () => {
        expect(CONVENTION_FILES).not.toContain('use');
        expect(CONVENTION_FILES).not.toContain('webhook');
    });
});
