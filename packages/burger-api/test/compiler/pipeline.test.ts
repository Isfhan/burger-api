import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DirectoryScanner } from '../../src/compiler/scanner';
import { ModuleLoader } from '../../src/compiler/module-loader';
import { Router } from '../../src/router/router';

/**
 * End-to-end pipeline test (no live server):
 * Directory Scanner → Module Loader → RouteModule → RouterCompiler → Router.
 * Verifies the whole pipeline produces a working dispatch table that handles
 * static, dynamic, wildcard, 405+Allow, and auto-HEAD correctly.
 *
 * Each route directory is self-contained — no group inheritance.
 */

function makeTree(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'burger-e2e-'));
    const write = (rel: string, contents: string) => {
        const full = path.join(root, rel);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, contents);
    };
    write(
        'users/route.ts',
        `export const GET = () => Response.json({ list: [] });
export const POST = () => new Response('created', { status: 201 });`
    );
    write('users/config.ts', `export default { auth: true };`);
    write(
        'users/[id]/route.ts',
        `export const GET = (req) => Response.json({ id: req.params.id });`
    );
    write(
        'files/[...]/route.ts',
        `export const GET = (req) => Response.json({ rest: req.wildcardParams });`
    );
    return root;
}

describe('Pipeline — end to end (self-contained routes)', () => {
    let root: string;
    let router: Router;

    beforeEach(async () => {
        root = makeTree();
        const scanned = await new DirectoryScanner(root, 'api').scan();
        const modules = await new ModuleLoader().load(scanned);
        router = new Router({});
        router.compile(
            modules.map((m) => ({
                path: m.path,
                handlers: m.handlers,
                schema: m.schema,
                openapi: m.openapi,
                isWildcard: m.isWildcard,
            }))
        );
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('serves a static route (GET)', async () => {
        const res = await router.fetch(new Request('http://h/api/users'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ list: [] });
    });

    it('serves a static route (POST) and returns 405+Allow for unsupported', async () => {
        const ok = await router.fetch(
            new Request('http://h/api/users', { method: 'POST' })
        );
        expect(ok.status).toBe(201);

        const bad = await router.fetch(
            new Request('http://h/api/users', { method: 'DELETE' })
        );
        expect(bad.status).toBe(405);
        expect(bad.headers.get('Allow')).toContain('GET');
        expect(bad.headers.get('Allow')).toContain('POST');
    });

    it('serves a dynamic route with params', async () => {
        const res = await router.fetch(new Request('http://h/api/users/42'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: '42' });
    });

    it('serves a wildcard route with wildcardParams', async () => {
        const res = await router.fetch(new Request('http://h/api/files/a/b/c'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ rest: ['a', 'b', 'c'] });
    });

    it('returns 404 for unknown static path', async () => {
        const res = await router.fetch(new Request('http://h/api/nope'));
        expect(res.status).toBe(404);
    });

    it('auto-HEAD derives from GET on static routes', async () => {
        const res = await router.fetch(
            new Request('http://h/api/users', { method: 'HEAD' })
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('content-length')).toBeDefined();
    });
});

describe('Pipeline — config.ts discovery', () => {
    it('config.ts is loaded and attached to RouteModule', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-config-'));
        try {
            const write = (rel: string, contents: string) => {
                const full = path.join(root, rel);
                mkdirSync(path.dirname(full), { recursive: true });
                writeFileSync(full, contents);
            };
            write(
                'items/route.ts',
                `export const GET = () => new Response('items');`
            );
            write(
                'items/config.ts',
                `export default { cache: true, timeout: 5000 };`
            );
            const scanned = await new DirectoryScanner(root, 'api').scan();
            const modules = await new ModuleLoader().load(scanned);
            const items = modules.find((m) => m.path === '/api/items')!;
            expect(items.config).toEqual({ cache: true, timeout: 5000 });
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
