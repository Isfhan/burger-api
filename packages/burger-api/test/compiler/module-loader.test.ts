import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DirectoryScanner } from '../../src/compiler/scanner';
import { ModuleLoader } from '../../src/compiler/module-loader';
import { RouteTree } from '../../src/compiler/route-tree';

/**
 * Tests for the Module Loader + Route Tree: assembles RouteModule from the
 * scanner inventory. Each route directory is self-contained — no group
 * inheritance merging. Auto-injects OPTIONS, fails fast on duplicate paths.
 */

function makeTree(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'burger-loader-'));
    const write = (rel: string, contents: string) => {
        const full = path.join(root, rel);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, contents);
    };
    // Self-contained route: users with own config, schema, hooks
    write(
        'users/route.ts',
        `export const GET = () => new Response('users');
export const POST = () => new Response('created', { status: 201 });`
    );
    write('users/schema.ts', `export const POST = { body: {} };`);
    write('users/hooks.ts', `export const beforeRoute = ['auth'];`);
    write('users/config.ts', `export default { auth: true };`);
    // Self-contained route: dashboard with no extra files
    write(
        'dashboard/route.ts',
        `export const GET = () => new Response('admin-dashboard');`
    );
    return root;
}

describe('ModuleLoader — assembly (self-contained routes)', () => {
    let root: string;
    let modules: Awaited<ReturnType<ModuleLoader['load']>>;

    beforeEach(async () => {
        root = makeTree();
        const scanned = await new DirectoryScanner(root, 'api').scan();
        modules = await new ModuleLoader().load(scanned);
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('assembles one RouteModule per scanned route', () => {
        const paths = modules.map((m) => m.path).sort();
        expect(paths).toEqual(['/api/dashboard', '/api/users']);
    });

    it('extracts HTTP method handlers from route.ts', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        expect(typeof users.handlers.GET).toBe('function');
        expect(typeof users.handlers.POST).toBe('function');
    });

    it('auto-injects OPTIONS for preflight methods', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        expect(typeof users.handlers.OPTIONS).toBe('function');
    });

    it('loads route-local hooks (no group inheritance)', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        expect(users.hooks).toMatchObject({
            beforeRoute: ['auth'],
        });
    });

    it('loads route-local schema', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        // normalizeSchema() converts uppercase exports to lowercase keys
        expect(users.schema).toMatchObject({ post: { body: {} } });
    });

    it('loads route-local config', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        expect(users.config).toEqual({ auth: true });
    });

    it('route without config still works (config is optional)', () => {
        const dashboard = modules.find((m) => m.path === '/api/dashboard')!;
        expect(dashboard.config).toBeUndefined();
    });

    it('does not have groupChain or groupFiles (self-contained)', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        expect(users).not.toHaveProperty('groupChain');
        expect(users).not.toHaveProperty('groupFiles');
    });
});

describe('ModuleLoader — fail fast', () => {
    it('throws on duplicate resolved route paths', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-loader-'));
        try {
            const write = (rel: string) => {
                const full = path.join(root, rel);
                mkdirSync(path.dirname(full), { recursive: true });
                writeFileSync(
                    full,
                    `export const GET = () => new Response('x');`
                );
            };
            // Two route directories that resolve to the SAME path because one
            // is wrapped in a route group (which does not affect the URL).
            write('users/route.ts');
            write('(g)/users/route.ts');
            const scanned = await new DirectoryScanner(root, 'api').scan();
            await expect(new ModuleLoader().load(scanned)).rejects.toThrow(
                /Duplicate route path/
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('RouteTree', () => {
    it('indexes modules by path and sorts deterministically', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-tree-'));
        try {
            const write = (rel: string) => {
                const full = path.join(root, rel);
                mkdirSync(path.dirname(full), { recursive: true });
                writeFileSync(
                    full,
                    `export const GET = () => new Response('x');`
                );
            };
            write('b/route.ts');
            write('a/route.ts');
            write('c/route.ts');
            const scanned = await new DirectoryScanner(root, 'api').scan();
            const modules = await new ModuleLoader().load(scanned);
            const tree = new RouteTree(modules);
            expect(tree.size).toBe(3);
            expect(tree.list().map((m) => m.path)).toEqual([
                '/api/a',
                '/api/b',
                '/api/c',
            ]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
