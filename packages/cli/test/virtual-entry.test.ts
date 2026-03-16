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
        expect(source).not.toContain('globalMiddleware: []');
    });
});
