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

type VirtualEntryHelpers = {
    __mod: (...args: any[]) => any;
    __get: (...args: any[]) => any;
    __pick: (...args: any[]) => any;
    __handlers: (...args: any[]) => any;
    __normOpenapi: (...args: any[]) => any;
    __config: (...args: any[]) => any;
    __page: (...args: any[]) => any;
};

/** Evaluate the helper functions the generated entry defines. */
function loadHelpers(): VirtualEntryHelpers {
    const source = generateVirtualEntrySource(
        config,
        [{ importPath: '/tmp/api/route.ts', routePath: '/api', isWildcard: false }],
        [{ importPath: '/tmp/pages/index.html', routePath: '/' }]
    );
    const start = source.indexOf('function __mod(');
    const end = source.indexOf('\nconst apiRoutes');
    const helpers = source.slice(start, end).replace(/^import .*$/gm, '');
    return new Function(
        `${helpers}\nreturn { __mod, __get, __pick, __handlers, __normOpenapi, __config, __page };`
    )();
}

describe('generateVirtualEntrySource', () => {
    it('reads handlers from the module namespace at startup (no build-time export guessing)', () => {
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

        expect(source).toContain('handlers: __handlers(_r0),');
        expect(source).not.toContain('GET: _r0.GET');
    });

    it('__handlers keeps only function exports; the framework adds auto OPTIONS', () => {
        const { __handlers } = loadHelpers();
        const noop = () => new Response('x');

        const getOnly = __handlers({ GET: noop, schema: {} });
        expect(Object.keys(getOnly)).toEqual(['GET']);

        // Core's router adds its own 204 + Allow OPTIONS and skips
        // beforeRoute for it; the build entry must not shadow that.
        const withPost = __handlers({ GET: noop, POST: noop, PUT: 'nope' });
        expect(Object.keys(withPost).sort()).toEqual(['GET', 'POST']);
        expect(withPost.OPTIONS).toBeUndefined();

        const ownOptions = () => new Response('mine');
        const custom = __handlers({ POST: noop, OPTIONS: ownOptions });
        expect(custom.OPTIONS).toBe(ownOptions);
    });

    it('__mod unwraps default exports like the dev ModuleLoader', () => {
        const { __mod } = loadHelpers();
        const inner = { auth: false };
        expect(__mod({ default: inner })).toBe(inner);
        const ns = { beforeRoute: [] };
        expect(__mod(ns)).toBe(ns);
    });

    it('bundleBunAdapter: true statically imports BunAdapter via ServerOptions.adapter (regression: build:exec cannot resolve computed dynamic imports)', () => {
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

    it('node/portable targets never import BunAdapter (must stay dynamic-only for WinterCG targets)', () => {
        for (const target of ['node', 'cloudflare', 'deno', 'vercel'] as const) {
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
                false,
                target
            );

            expect(source).not.toContain('BunAdapter');
            expect(source).not.toContain("from 'burger-api/adapter/bun'");
        }
    });

    it('bundleBunAdapter: false on bun keeps BunAdapter out (browser passthrough)', () => {
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
            false,
            'bun'
        );

        expect(source).not.toContain('BunAdapter');
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
        // Bare `_c0` binds the raw namespace ({ default: {...} }), so
        // ctx.config.auth would be undefined in production even with
        // `auth: false`.
        expect(source).toContain('config: __config(_c0),');
        expect(source).not.toContain('config: _c0,');
    });

    it('__config merges per-method config exports over the default (production parity with dev)', () => {
        const { __config } = loadHelpers();
        const base = { auth: false };

        // Default-only keeps the exact object (route-wide identity).
        expect(__config({ default: base })).toBe(base);

        // Method exports ride along as uppercase keys; index.ts lowercases
        // them for the route compiler.
        const merged = __config({
            default: base,
            POST: { auth: { required: true } },
        });
        expect(merged).toEqual({
            auth: false,
            POST: { auth: { required: true } },
        });

        // No default: the namespace itself is the route-wide config.
        const noDefault = { auth: false, POST: { auth: true } };
        expect(__config(noDefault)).toBe(noDefault);
    });

    it('optional route exports are read through __get (no bundler import-is-undefined warnings)', () => {
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

        expect(source).toContain("schema: __get(_r0, 'schema'),");
        expect(source).toContain("hooks: __get(_r0, 'hooks'),");
        expect(source).not.toContain('_r0.schema');
    });

    it('always emits an explicit debug flag before the entry options spread', () => {
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

        const debugAt = source.indexOf(' debug: false,');
        expect(debugAt).toBeGreaterThan(-1);
        expect(debugAt).toBeLessThan(source.indexOf('...__burgerOptions'));
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

        expect(source).toContain('{ path: "/", handler: __page(_p0) }');
        expect(source).toContain('{ path: "/about", handler: __page(_p1) }');
        expect(source).toContain('{ path: "/about/", handler: __page(_p1) }');
    });

    it('__page wraps raw-string HTML imports in a text/html Response factory', async () => {
        const { __page } = loadHelpers();
        const html = '<!DOCTYPE html><h1>hi</h1>';

        const handler = __page({ default: html });
        const res = handler();
        expect(res.headers.get('content-type')).toBe(
            'text/html; charset=utf-8'
        );
        expect(await res.text()).toBe(html);
    });

    it('__page passes function page handlers (TSX) through unchanged', () => {
        const { __page } = loadHelpers();
        const fn = () => new Response('tsx');
        expect(__page({ default: fn })).toBe(fn);
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

    it('defaults to bun: app.serve() with the statically imported BunAdapter', () => {
        const source = generateVirtualEntrySource(config, routeEntries, []);
        expect(source).toContain('runtimeTarget: "bun"');
        expect(source).toContain('app.serve(port,');
        expect(source).toContain('process.chdir(import.meta.dir);');
        // Bun bundles run without node_modules next to them, so the adapter
        // must be embedded rather than resolved at runtime.
        expect(source).toContain(
            "import { BunAdapter as __BunAdapter } from 'burger-api/adapter/bun';"
        );
        expect(source).toContain('adapter: new __BunAdapter(),');
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
