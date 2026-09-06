import { describe, expect, it } from 'bun:test';
import { generateVirtualEntrySource } from '../src/utils/virtual-entry';
import type { BuildConfig } from '../src/types/index';

const config: BuildConfig = {
    apiDir: './api',
    pageDir: './pages',
    apiPrefix: '/api',
    pagePrefix: '/',
    debug: false,
};

describe('generateVirtualEntrySource', () => {
    it('when entry has no methods, emits all HTTP methods and auto OPTIONS', () => {
        const source = generateVirtualEntrySource(
            config,
            [
                {
                    importPath: '/tmp/api/route.ts',
                    routePath: '/api',
                    isWildcard: false,
                },
            ],
            []
        );

        expect(source).toContain('GET: _r0.GET');
        expect(source).toContain('POST: _r0.POST');
        expect(source).toContain('PUT: _r0.PUT');
        expect(source).toContain('DELETE: _r0.DELETE');
        expect(source).toContain('PATCH: _r0.PATCH');
        expect(source).toContain('HEAD: _r0.HEAD');
        expect(source).toContain(
            'OPTIONS: () => new Response(null, { status: 204 })'
        );
    });

    it('compile: true statically imports BunAdapter and injects it via ServerOptions.adapter (regression: build:exec cannot resolve a computed dynamic import specifier)', () => {
        const source = generateVirtualEntrySource(
            config,
            [
                {
                    importPath: '/tmp/api/route.ts',
                    routePath: '/api',
                    isWildcard: false,
                },
            ],
            [],
            undefined,
            undefined,
            [],
            [],
            true
        );

        expect(source).toContain(
            "import { BunAdapter as __BunAdapter } from 'burger-api/adapter/bun';"
        );
        expect(source).toContain('adapter: new __BunAdapter(),');
    });

    it('compile: false/undefined never imports BunAdapter (must stay dynamic-only for WinterCG targets)', () => {
        const source = generateVirtualEntrySource(
            config,
            [
                {
                    importPath: '/tmp/api/route.ts',
                    routePath: '/api',
                    isWildcard: false,
                },
            ],
            []
        );

        expect(source).not.toContain('BunAdapter');
        expect(source).not.toContain("from 'burger-api/adapter/bun'");
    });

    it('unwraps config.ts default export (regression: config.ts uses a default export, unlike schema/openapi/hooks)', () => {
        const source = generateVirtualEntrySource(
            config,
            [
                {
                    importPath: '/tmp/api/route.ts',
                    routePath: '/api',
                    isWildcard: false,
                    configPath: '/tmp/api/config.ts',
                },
            ],
            []
        );

        expect(source).toContain("import * as _c0 from '/tmp/api/config.ts'");
        // Bare `_c0` would bind the raw module namespace ({ default: {...} })
        // as the route's config, so `ctx.config.auth` is always undefined in
        // production even when config.ts sets `auth: false`.
        expect(source).toContain('config: _c0.default ?? _c0,');
        expect(source).not.toContain('config: _c0,');
    });

    it('when entry has methods [GET, POST], emits only those and auto OPTIONS', () => {
        const source = generateVirtualEntrySource(
            config,
            [
                {
                    importPath: '/tmp/api/route.ts',
                    routePath: '/api',
                    isWildcard: false,
                    methods: ['GET', 'POST'],
                },
            ],
            []
        );

        expect(source).toContain('GET: _r0.GET');
        expect(source).toContain('POST: _r0.POST');
        expect(source).toContain(
            'OPTIONS: () => new Response(null, { status: 204 })'
        );
        expect(source).not.toContain('PUT: _r0.PUT');
        expect(source).not.toContain('DELETE: _r0.DELETE');
        expect(source).not.toContain('PATCH: _r0.PATCH');
        expect(source).not.toContain('HEAD: _r0.HEAD');
    });

    it('when entry has only GET, does not emit OPTIONS', () => {
        const source = generateVirtualEntrySource(
            config,
            [
                {
                    importPath: '/tmp/api/route.ts',
                    routePath: '/api',
                    isWildcard: false,
                    methods: ['GET'],
                },
            ],
            []
        );

        expect(source).toContain('GET: _r0.GET');
        expect(source).not.toContain('OPTIONS:');
    });

    it('when entry has methods [GET, POST, OPTIONS], emits OPTIONS from module and no auto 204', () => {
        const source = generateVirtualEntrySource(
            config,
            [
                {
                    importPath: '/tmp/api/route.ts',
                    routePath: '/api',
                    isWildcard: false,
                    methods: ['GET', 'POST', 'OPTIONS'],
                },
            ],
            []
        );

        expect(source).toContain('GET: _r0.GET');
        expect(source).toContain('POST: _r0.POST');
        expect(source).toContain('OPTIONS: _r0.OPTIONS');
        expect(source).not.toContain(
            'OPTIONS: () => new Response(null, { status: 204 })'
        );
    });

    it('adds trailing slash aliases for non-root page routes', () => {
        const source = generateVirtualEntrySource(
            config,
            [],
            [
                { importPath: '/tmp/pages/index.html', routePath: '/' },
                { importPath: '/tmp/pages/about.html', routePath: '/about' },
            ]
        );

        expect(source).toContain('{ path: "/", handler: _p0.default }');
        expect(source).toContain('{ path: "/about", handler: _p1.default }');
        expect(source).toContain('{ path: "/about/", handler: _p1.default }');
    });

    it('spreads preserved Burger options when an options module is provided', () => {
        const source = generateVirtualEntrySource(
            config,
            [
                {
                    importPath: '/tmp/api/route.ts',
                    routePath: '/api',
                    isWildcard: false,
                },
            ],
            [],
            '/tmp/__burger_build_options__.ts'
        );

        expect(source).toContain(
            "import { burgerOptions as __burgerOptions } from '/tmp/__burger_build_options__.ts';"
        );
        expect(source).toContain('...__burgerOptions');
        expect(source).not.toContain('globalMiddleware');
    });
});

describe('generateVirtualEntrySource: --target codegen', () => {
    const routeEntries = [
        {
            importPath: '/tmp/api/route.ts',
            routePath: '/api',
            isWildcard: false,
        },
    ];

    it('defaults to bun: app.serve(), no runtimeTarget branch imports', () => {
        const source = generateVirtualEntrySource(config, routeEntries, []);
        expect(source).toContain('runtimeTarget: "bun"');
        expect(source).toContain('app.serve(port,');
        expect(source).toContain('process.chdir(import.meta.dir);');
        expect(source).not.toContain("from '@burger-api/node-server'");
        expect(source).not.toContain('toFetchHandler');
    });

    it('target=node: imports serve() from @burger-api/node-server instead of app.serve()', () => {
        const source = generateVirtualEntrySource(
            config,
            routeEntries,
            [],
            undefined,
            undefined,
            [],
            [],
            false,
            'node'
        );
        expect(source).toContain('runtimeTarget: "node"');
        expect(source).toContain(
            "import { serve } from '@burger-api/node-server';"
        );
        expect(source).toContain('serve(app, { port });');
        expect(source).not.toContain('app.serve(');
        // Bun-only chunk-path fixup must not leak into a Node-run bundle.
        expect(source).not.toContain('process.chdir(import.meta.dir);');
    });

    for (const target of ['cloudflare', 'deno'] as const) {
        it(`target=${target}: bare fetch export, no port/serve, no chdir`, () => {
            const source = generateVirtualEntrySource(
                config,
                routeEntries,
                [],
                undefined,
                undefined,
                [],
                [],
                false,
                target
            );
            expect(source).toContain(`runtimeTarget: "${target}"`);
            expect(source).toContain(
                "import { toFetchHandler } from 'burger-api';"
            );
            expect(source).toContain(
                'export default { fetch: toFetchHandler(app) };'
            );
            expect(source).not.toContain('app.serve(');
            expect(source).not.toContain('process.chdir(import.meta.dir);');
            expect(source).not.toContain("runtime = 'nodejs'");
        });
    }

    it("target=vercel: also emits export const runtime = 'nodejs' (required for the fetch shape)", () => {
        const source = generateVirtualEntrySource(
            config,
            routeEntries,
            [],
            undefined,
            undefined,
            [],
            [],
            false,
            'vercel'
        );
        expect(source).toContain('runtimeTarget: "vercel"');
        expect(source).toContain("export const runtime = 'nodejs';");
        expect(source).toContain(
            'export default { fetch: toFetchHandler(app) };'
        );
    });
});
