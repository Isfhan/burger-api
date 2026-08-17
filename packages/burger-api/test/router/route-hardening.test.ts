/**
 * Route/wildcard hardening: non-terminal wildcards and named wildcard
 * folders fail loudly; static pages beat dynamic ones; page params are
 * decoded; OpenAPI paths use `{path+}` with sanitized operationIds.
 */
import { describe, it, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Trie } from '../../src/router/trie';
import { DirectoryScanner } from '../../src/compiler/scanner';
import { PageRouter } from '../../src/core/page-router';
import { generateOpenAPIDocument } from '../../src/core/openapi';
import type { RouteDefinition } from '../../src/types/index';

const dummyHandler = (async () => new Response('ok')) as never;

describe('Trie — non-terminal wildcards', () => {
    it('rejects a wildcard segment followed by more segments', () => {
        const trie = new Trie();
        expect(() =>
            trie.insert('/files/*/x', dummyHandler, new Set(['GET']), false)
        ).toThrow(/wildcard|last segment/i);
    });

    it('accepts a terminal wildcard', () => {
        const trie = new Trie();
        expect(() =>
            trie.insert('/files/*', dummyHandler, new Set(['GET']), true)
        ).not.toThrow();
    });
});

describe('DirectoryScanner — named wildcard folders', () => {
    it("throws on a '[...slug]' folder instead of emitting a dead route", async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-scan-'));
        try {
            mkdirSync(path.join(root, 'blog', '[...slug]'), {
                recursive: true,
            });
            writeFileSync(path.join(root, 'blog', '[...slug]', 'route.ts'), 'export {};');
            const scanner = new DirectoryScanner(root, 'api');
            await expect(scanner.scan()).rejects.toThrow(/wildcard/i);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('PageRouter — static over dynamic, decoding, loud failures', () => {
    it('resolves a static page over a dynamic one at the same depth', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-pages-'));
        try {
            const writePage = (rel: string) => {
                const full = path.join(root, 'pages', rel);
                mkdirSync(path.dirname(full), { recursive: true });
                writeFileSync(
                    full,
                    'export default function () { return new Response("ok"); }'
                );
            };
            writePage('posts/new/index.tsx');
            writePage('posts/[id]/index.tsx');
            const router = new PageRouter(path.join(root, 'pages'), '');
            await router.loadPages();
            const match = router.resolve(
                new Request('http://h/posts/new')
            );
            expect(match.page?.path).toBe('/posts/new');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('decodes percent-encoded dynamic page params', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-pages-'));
        try {
            const full = path.join(root, 'pages', 'posts', '[id]');
            mkdirSync(full, { recursive: true });
            writeFileSync(
                path.join(full, 'index.tsx'),
                'export default function () { return new Response("ok"); }'
            );
            const router = new PageRouter(path.join(root, 'pages'), '');
            await router.loadPages();
            const match = router.resolve(
                new Request('http://h/posts/caf%C3%A9')
            );
            expect(match.params.id).toBe('café');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it("throws on a '[...slug]' page folder instead of silently skipping it", async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-pages-'));
        try {
            mkdirSync(path.join(root, 'pages', 'files', '[...slug]'), {
                recursive: true,
            });
            writeFileSync(
                path.join(root, 'pages', 'files', '[...slug]', 'index.tsx'),
                'export default function () { return new Response("ok"); }'
            );
            const router = new PageRouter(path.join(root, 'pages'), '');
            await expect(router.loadPages()).rejects.toThrow(/wildcard/i);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('rethrows a page import failure instead of silently dropping the page', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-pages-'));
        try {
            mkdirSync(path.join(root, 'pages', 'broken'), {
                recursive: true,
            });
            writeFileSync(
                path.join(root, 'pages', 'broken', 'index.tsx'),
                'export default function ( { this is not valid'
            );
            const router = new PageRouter(path.join(root, 'pages'), '');
            await expect(router.loadPages()).rejects.toThrow();
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('serves a raw html page default with the text/html content type', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'burger-pages-'));
        try {
            mkdirSync(path.join(root, 'pages', 'static'), {
                recursive: true,
            });
            writeFileSync(
                path.join(root, 'pages', 'static', 'index.html'),
                '<h1>hello</h1>'
            );
            const router = new PageRouter(path.join(root, 'pages'), '');
            await router.loadPages();
            const page = router.pages.find((p) => p.path === '/static');
            expect(page).toBeDefined();
            const res = await page!.handler({} as never);
            expect(res.headers.get('content-type')).toContain('text/html');
            expect(await res.text()).toBe('<h1>hello</h1>');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('OpenAPI — wildcard paths and operationIds', () => {
    const baseOptions = { title: 'T', version: '1.0.0' } as any;

    it('renders a catch-all route as a {path+} template', () => {
        const routes: RouteDefinition[] = [
            {
                path: '/files/*',
                handlers: { GET: () => Response.json({}) },
            },
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        expect(doc.paths['/files/{path+}']).toBeDefined();
        expect(doc.paths['/files/*']).toBeUndefined();
    });

    it('sanitizes wildcard chars out of generated operationIds', () => {
        const routes: RouteDefinition[] = [
            {
                path: '/files/*',
                handlers: { GET: () => Response.json({}) },
            },
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        const opId = (doc.paths['/files/{path+}'] as any).get.operationId as string;
        expect(opId).toMatch(/^[a-zA-Z0-9_.-]+$/);
        expect(opId).not.toContain('*');
    });

    it('dedupes colliding operationIds with a numeric suffix', () => {
        const routes: RouteDefinition[] = [
            {
                path: '/x:y',
                handlers: { GET: () => Response.json({}) },
            },
            {
                path: '/x/y',
                handlers: { GET: () => Response.json({}) },
            },
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        const ids = Object.values(doc.paths).map(
            (p) => (p as any).get.operationId as string
        );
        expect(new Set(ids).size).toBe(2);
        expect(ids.some((id) => /_2$/.test(id))).toBe(true);
    });
});