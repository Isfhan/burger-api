import { describe, it, expect, beforeAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Burger, toFetchHandler } from '../../src/index';
import type { RouteDefinition } from '../../src/types/index';
import type { FetchHandlerEntry } from '../../src/adapter/web-standard';
import { z } from 'zod';

/**
 * WinterCG fetch-entry tests: `toFetchHandler` dispatches Web-Standard
 * `Request` objects with no Bun server, no filesystem scanning, and full
 * lifecycle behavior (validation, errors, docs).
 */

const routeDefinitions: RouteDefinition[] = [
    {
        path: '/api/products',
        handlers: {
            GET: () => Response.json({ name: 'Burger' }),
            POST: () => Response.json({ created: true }, { status: 201 }),
        },
        schema: {
            post: {
                body: z.object({ name: z.string().min(1) }),
            },
        },
        openapi: {
            get: { summary: 'List products' },
        },
    },
    {
        path: '/api/users/:id',
        handlers: {
            GET: (ctx) =>
                Response.json({ id: ctx.params?.id, wildcard: false }),
        },
        isWildcard: false,
    },
    {
        path: '/api/files/*',
        handlers: {
            GET: (ctx) =>
                Response.json({ rest: ctx.wildcardParams ?? [] }),
        },
        isWildcard: true,
    },
];

let handler: FetchHandlerEntry;

beforeAll(async () => {
    const burger = new Burger({
        title: 'Web-standard test',
        apiRoutes: routeDefinitions,
        debug: false,
        openapi: {
            enabled: true,
            title: 'Web-standard test',
            docsAuth: { username: 'admin', password: 'secret' },
            provider: () => 'docs-html',
        },
    });
    handler = toFetchHandler(burger);
});

function req(url: string, init?: RequestInit): Request {
    return new Request(`http://localhost${url}`, init);
}

describe('toFetchHandler — static routes (AOT)', () => {
    it('dispatches a static GET route', async () => {
        const res = await handler(req('/api/products'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ name: 'Burger' });
    });

    it('dispatches method dispatch and 405 for unknown methods', async () => {
        const res = await handler(req('/api/products', { method: 'DELETE' }));
        expect(res.status).toBe(405);
        expect(res.headers.get('Allow')).toContain('GET');
    });

    it('runs validation (422 + RFC 9457) on invalid body', async () => {
        const res = await handler(
            req('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: '' }),
            })
        );
        expect(res.status).toBe(422);
        expect(res.headers.get('Content-Type')).toContain('problem+json');
    });

    it('accepts a valid body', async () => {
        const res = await handler(
            req('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Fries' }),
            })
        );
        expect(res.status).toBe(201);
    });

    it('returns 404 for unmatched paths', async () => {
        const res = await handler(req('/api/nope'));
        expect(res.status).toBe(404);
    });
});

describe('toFetchHandler — dynamic and wildcard routes (trie)', () => {
    it('matches a :param route via the trie', async () => {
        const res = await handler(req('/api/users/42'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: '42', wildcard: false });
    });

    it('matches a wildcard route via the trie', async () => {
        const res = await handler(req('/api/files/a/b/c'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ rest: ['a', 'b', 'c'] });
    });
});

describe('toFetchHandler — OpenAPI and docs', () => {
    it('serves the OpenAPI spec', async () => {
        const res = await handler(req('/openapi.json'));
        expect(res.status).toBe(200);
        const spec = await res.json();
        expect(spec.paths['/api/products']).toBeDefined();
    });

    it('protects /docs with basic auth (401 without credentials)', async () => {
        const res = await handler(req('/docs'));
        expect(res.status).toBe(401);
        expect(res.headers.get('WWW-Authenticate')).toBe(
            'Basic realm="Documentation"'
        );
    });

    it('rejects wrong credentials', async () => {
        const res = await handler(
            req('/docs', {
                headers: {
                    authorization:
                        'Basic ' + btoa('admin:wrong'),
                },
            })
        );
        expect(res.status).toBe(401);
    });

    it('serves docs with valid credentials', async () => {
        const res = await handler(
            req('/docs', {
                headers: {
                    authorization: 'Basic ' + btoa('admin:secret'),
                },
            })
        );
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('docs-html');
    });
});

describe('toFetchHandler — default docs provider', () => {
    it('serves Swagger UI when no provider is configured', async () => {
        const burger = new Burger({
            apiRoutes: routeDefinitions,
            openapi: { enabled: true, title: 'Default provider' },
        });
        const h = toFetchHandler(burger);
        const res = await h(req('/docs'));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('swagger-ui');
        expect(html).toContain('SwaggerUIBundle');
    });

    it('still serves the raw spec alongside the default UI', async () => {
        const burger = new Burger({
            apiRoutes: routeDefinitions,
            openapi: { enabled: true, title: 'Default provider' },
        });
        const h = toFetchHandler(burger);
        const res = await h(req('/openapi.json'));
        expect(res.status).toBe(200);
        const spec = await res.json();
        expect(spec.paths['/api/products']).toBeDefined();
    });
});

describe('toFetchHandler — runtime independence', () => {
    it('never scans the filesystem (AOT routes only)', async () => {
        const burger = new Burger({ apiRoutes: routeDefinitions });
        const h = toFetchHandler(burger);
        const res = await h(req('/api/products'));
        expect(await res.json()).toEqual({ name: 'Burger' });
    });

    it('passes through platform env args without error', async () => {
        const res = await handler(
            req('/api/products'),
            { CF_ENV: 'test' },
            new Map()
        );
        expect(res.status).toBe(200);
    });
});

describe('toFetchHandler — WinterCG bundle shape', () => {
    it('bundles for a non-Bun target without a bun import', async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'burger-fetch-'));
        try {
            writeFileSync(
                path.join(dir, 'entry.ts'),
                [
                    `import { Burger, toFetchHandler } from ${JSON.stringify(
                        path.relative(dir, path.resolve(import.meta.dir, '../../src/index.ts')).replaceAll('\\', '/')
                    )};`,
                    `const burger = new Burger({ apiRoutes: [] });`,
                    `export default { fetch: toFetchHandler(burger) };`,
                ].join('\n')
            );

            const result = await Bun.build({
                entrypoints: [path.join(dir, 'entry.ts')],
                outdir: path.join(dir, 'dist'),
                target: 'browser',
            });
            expect(result.success).toBe(true);
            const out = await Bun.file(
                path.join(dir, 'dist', 'entry.js')
            ).text();
            // The web-standard entry must not statically pull the Bun adapter.
            // The adapter is only reachable via a non-static dynamic import
            // (lazily, on serve()), which bundlers keep external — a bundled
            // `import { serve } from 'bun'` would fail browser-target builds.
            expect(out).not.toContain('from "bun"');
            expect(out).not.toContain('from \'bun\'');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
