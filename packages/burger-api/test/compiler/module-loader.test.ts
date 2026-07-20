import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DirectoryScanner } from '../../src/compiler/scanner';
import { ModuleLoader } from '../../src/compiler/module-loader';
import { RouteTree } from '../../src/compiler/route-tree';

/**
 * M2 tests for the Module Loader + Route Tree: assembles RouteModule from the
 * scanner inventory, merges group inheritance (nearest-last), overrides
 * route-local files, auto-injects OPTIONS, and fails fast on duplicate paths.
 */

function makeTree(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'burger-loader-'));
    const write = (rel: string, contents: string) => {
        const full = path.join(root, rel);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, contents);
    };
    // Global group (api root) + (admin) group + route
    write(
        '(admin)/hooks.ts',
        `export const beforeHandle = ['groupAdmin'];`
    );
    write(
        '(admin)/dashboard/route.ts',
        `export const GET = () => new Response('admin-dashboard');`
    );
    // users route lives INSIDE the (api) group, so it inherits (api)/hooks.ts
    write('(api)/hooks.ts', `export const beforeHandle = ['apiRoot'];`);
    write(
        '(api)/users/route.ts',
        `export const GET = () => new Response('users');
export const POST = () => new Response('created', { status: 201 });`
    );
    write('(api)/users/schema.ts', `export const get = { query: {} };`);
    write('(api)/users/hooks.ts', `export const beforeHandle = ['usersHook'];`);
    write('(api)/users/use.ts', `export default ['cors'];`);
    return root;
}

describe('ModuleLoader — assembly & inheritance', () => {
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

    it('merges group hooks nearest-last (append)', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        // (api) group hook first, then route-local hook.
        expect(users.hooks).toMatchObject({
            beforeHandle: ['apiRoot', 'usersHook'],
        });
    });

    it('appends capability arrays group → route', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        // No group (api)/use.ts in this fixture, so only the route's.
        expect(users.capabilities).toEqual(['cors']);
    });

    it('carries route-local schema', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        expect(users.schema).toMatchObject({ get: { query: {} } });
    });

    it('records the group chain', () => {
        const users = modules.find((m) => m.path === '/api/users')!;
        expect(users.groupChain).toEqual(['(api)']);
    });
});

describe('ModuleLoader — fail fast', () => {
    it('throws on duplicate resolved route paths', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-loader-'));
        try {
            const write = (rel: string) => {
                const full = path.join(root, rel);
                mkdirSync(path.dirname(full), { recursive: true });
                writeFileSync(full, `export const GET = () => new Response('x');`);
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
                writeFileSync(full, `export const GET = () => new Response('x');`);
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
