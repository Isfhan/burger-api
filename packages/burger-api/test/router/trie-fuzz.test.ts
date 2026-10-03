/**
 * Differential fuzz: the radix trie (`src/router/trie.ts`) must produce
 * identical match results to the legacy segment trie in
 * `trie-legacy.fixture.ts` across randomized route sets and 10k random
 * pathnames (encoded, unicode, empty segments, trailing slashes). Compared:
 * pattern, isWildcard, params, wildcardParams, methods, handler identity,
 * `allowedMethods`, and `orderedPatterns`.
 */
import { describe, it, expect } from 'bun:test';
import { Trie } from '../../src/router/trie';
import { LegacyTrie, type LegacyTrieMatch } from './trie-legacy.fixture';
import type { TrieMatch } from '../../src/router/trie';
import {
    buildRegexMatcher,
    type RegexRouteEntry,
} from '../../src/router/regex-matcher';
import type { CompiledHandler } from '../../src/router/types';

/** Deterministic PRNG (mulberry32) so failures reproduce exactly. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface RouteSpec {
    path: string;
    isWildcard: boolean;
    methods: Set<string>;
    handler: CompiledHandler;
}

const handlerIds = new Map<CompiledHandler, number>();
let nextHandlerId = 1;

function handlerId(handler: CompiledHandler): number {
    let id = handlerIds.get(handler);
    if (id === undefined) {
        id = nextHandlerId++;
        handlerIds.set(handler, id);
    }
    return id;
}

function makeRoute(path: string, methodList: string[]): RouteSpec {
    return {
        path,
        isWildcard: path.includes('*'),
        methods: new Set(methodList),
        handler: (() => new Response(path)) as unknown as CompiledHandler,
    };
}

interface Pair {
    current: Trie;
    legacy: LegacyTrie;
    routes: RouteSpec[];
}

function buildPair(routes: RouteSpec[]): Pair {
    const current = new Trie();
    const legacy = new LegacyTrie();
    for (const route of routes) {
        current.insert(
            route.path,
            route.handler,
            route.methods,
            route.isWildcard
        );
        legacy.insert(
            route.path,
            route.handler,
            route.methods,
            route.isWildcard
        );
    }
    return { current, legacy, routes };
}

interface Normalized {
    pattern: string;
    isWildcard: boolean;
    params: Record<string, string>;
    wildcardParams: string[] | null;
    methods: string[];
    handler: number;
}

function normalize(
    match: TrieMatch | LegacyTrieMatch | null
): Normalized | null {
    if (match === null) return null;
    return {
        pattern: match.pattern,
        isWildcard: match.isWildcard,
        params: match.params,
        wildcardParams: match.wildcardParams ?? null,
        methods: [...match.methods].sort(),
        handler: handlerId(match.handler),
    };
}

const routePaths = (pair: Pair): string =>
    pair.routes.map((route) => route.path).join(', ');

/** Throws with full context on the first divergence; silent when identical. */
function assertSameMatch(pair: Pair, pathname: string): void {
    let actual: Normalized | null;
    let expected: Normalized | null;
    try {
        actual = normalize(pair.current.match(pathname));
    } catch (error) {
        throw new Error(
            `radix match threw for ${JSON.stringify(pathname)} ` +
                `(routes: ${routePaths(pair)}): ${(error as Error).message}`
        );
    }
    try {
        expected = normalize(pair.legacy.match(pathname));
    } catch (error) {
        throw new Error(
            `legacy match threw for ${JSON.stringify(pathname)} ` +
                `(routes: ${routePaths(pair)}): ${(error as Error).message}`
        );
    }
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
        throw new Error(
            `match divergence for ${JSON.stringify(pathname)}\n` +
                `  radix : ${actualJson}\n` +
                `  legacy: ${expectedJson}\n` +
                `  routes: ${routePaths(pair)}`
        );
    }

    const actualAllow = pair.current.allowedMethods(pathname);
    const expectedAllow = pair.legacy.allowedMethods(pathname);
    const aAllow =
        actualAllow === null ? null : [...actualAllow].sort().join(',');
    const eAllow =
        expectedAllow === null ? null : [...expectedAllow].sort().join(',');
    if (aAllow !== eAllow) {
        throw new Error(
            `allowedMethods divergence for ${JSON.stringify(pathname)}\n` +
                `  radix : ${aAllow}\n` +
                `  legacy: ${eAllow}\n` +
                `  routes: ${routePaths(pair)}`
        );
    }
}

/**
 * The radix tree groups static siblings by first character (compressed-radix
 * property), so `orderedPatterns()` may interleave *pairwise disjoint*
 * branches differently than the segment trie. The membership must be
 * identical; the order's behavioral effect is checked by
 * `assertSameRegexDecisions` (the regex matcher consumes this order).
 */
function assertSamePatternSet(pair: Pair): void {
    const actual = pair.current.orderedPatterns().slice().sort();
    const expected = pair.legacy.orderedPatterns().slice().sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `orderedPatterns membership divergence\n` +
                `  radix : ${actual.join(', ')}\n` +
                `  legacy: ${expected.join(', ')}\n` +
                `  routes: ${routePaths(pair)}`
        );
    }
}

/**
 * `orderedPatterns()` is the authoritative ordering for the regex matcher
 * (`buildRegexMatcher(entries, order)`). Whatever order each trie emits, the
 * resulting matchers must make identical routing decisions on every path.
 */
function assertSameRegexDecisions(pair: Pair, paths: string[]): void {
    const entries: RegexRouteEntry[] = pair.routes.map((route) => ({
        path: route.path,
        handler: route.handler,
        methods: route.methods,
        isWildcard: route.isWildcard,
    }));
    const fromRadix = buildRegexMatcher(
        entries,
        pair.current.orderedPatterns()
    );
    const fromLegacy = buildRegexMatcher(
        entries,
        pair.legacy.orderedPatterns()
    );
    if (fromRadix === null || fromLegacy === null) return;
    for (const pathname of paths) {
        const actual = JSON.stringify(normalize(fromRadix(pathname)));
        const expected = JSON.stringify(normalize(fromLegacy(pathname)));
        if (actual !== expected) {
            throw new Error(
                `regex decision divergence for ${JSON.stringify(pathname)}\n` +
                    `  radix order : ${actual}\n` +
                    `  legacy order: ${expected}\n` +
                    `  routes: ${routePaths(pair)}`
            );
        }
    }
}

const LITERALS = [
    'a',
    'b',
    'users',
    'v2',
    'x-y',
    'admin',
    'api',
    'file',
    '42',
    '(group)',
    '[x]',
    'a.b',
    '100%',
    '日本語',
];

const METHOD_SETS = [
    ['GET'],
    ['GET', 'POST'],
    ['POST'],
    ['GET', 'PUT', 'DELETE'],
];

function generateRouteSet(rand: () => number): RouteSpec[] {
    const count = 5 + Math.floor(rand() * 15);
    const seen = new Set<string>();
    const routes: RouteSpec[] = [];
    let guard = 0;
    while (routes.length < count && guard++ < count * 30) {
        const depth = Math.floor(rand() * 4);
        const segments: string[] = [];
        for (let d = 0; d < depth; d++) {
            if (rand() < 0.35) segments.push(':id');
            else segments.push(LITERALS[Math.floor(rand() * LITERALS.length)]!);
        }
        if (rand() < 0.22) segments.push('*');
        const path = '/' + segments.join('/');
        if (seen.has(path)) continue;
        seen.add(path);
        routes.push(
            makeRoute(
                path,
                METHOD_SETS[Math.floor(rand() * METHOD_SETS.length)]!
            )
        );
    }
    return routes;
}

const PATH_VALUES = [
    'a',
    'b',
    'users',
    'v2',
    'x-y',
    'admin',
    'api',
    'file',
    '42',
    '(group)',
    '[x]',
    'a.b',
    '100%',
    '日本語',
    'café',
    '😀',
    '%20',
    '%2F',
    '%2f',
    '%C3%BC',
    '%c3%bc',
    '%zz',
    '%E0%A4%A',
    '%',
    '..',
    '.',
    '',
    'x y',
];

function randomPath(rand: () => number): string {
    const depth = 1 + Math.floor(rand() * 5);
    const absolute = rand() < 0.9;
    let path = absolute ? '/' : '';
    for (let d = 0; d < depth; d++) {
        path += PATH_VALUES[Math.floor(rand() * PATH_VALUES.length)];
        const last = d === depth - 1;
        if (!last || rand() < 0.5) path += '/';
    }
    if (rand() < 0.12) path += '/';
    if (rand() < 0.06) path += '/';
    return path;
}

/** Builds a pathname that should exercise one route's pattern. */
function derivedPath(route: RouteSpec, rand: () => number): string {
    let path = route.path;
    path = path.replace(/:id/g, () => {
        const value = PATH_VALUES[Math.floor(rand() * 16)] ?? 'v';
        if (rand() < 0.12) return '';
        return value === '%' || value === ''
            ? 'v' + Math.floor(rand() * 90)
            : value;
    });
    if (path.includes('*')) {
        path = path.replace('*', () => {
            const extra = Math.floor(rand() * 3);
            const segs: string[] = [];
            for (let e = 0; e < extra; e++) {
                segs.push(
                    PATH_VALUES[Math.floor(rand() * PATH_VALUES.length)]!
                );
            }
            return segs.join('/');
        });
        path = path.replace(/\/$/, '');
    }
    if (rand() < 0.15) path += '/';
    if (rand() < 0.08) {
        path += '/' + (PATH_VALUES[Math.floor(rand() * 16)] ?? 'v');
    }
    if (rand() < 0.08 && path.length > 1) path = path.slice(0, -1);
    return path;
}

const KITCHEN_SINK: RouteSpec[] = [
    '/',
    '/api/users',
    '/api/users/:id',
    '/api/users/:id/posts',
    '/api/users/:id/posts/:id',
    '/api/users/admin/settings',
    '/api/files/*',
    '/api/files/docs/*',
    '/api/mix/:id/static',
    '/api/mix/static/:id',
    '/api/:id/deep',
    '/api/a/b/c',
    '/api/a/:id/c',
    '/:id',
    '/:id/extra',
    '/wild/*',
    '/wild/static',
    '/encoded/:id',
    '/(group)/thing',
    '/unicode/:id',
].map((path, index) => {
    const methods = METHOD_SETS[index % METHOD_SETS.length]!;
    return makeRoute(path, methods);
});

const EDGE_PATHS = [
    '/',
    '',
    '/api',
    '/api/',
    '/api/users',
    '/api/users/',
    '/api/users/42',
    '/api/users/42/',
    '/api/users/42/posts',
    '/api/users/42/posts/7',
    '/api/users/admin',
    '/api/users/admin/',
    '/api/users/admin/settings',
    '/api/files',
    '/api/files/',
    '/api/files/a',
    '/api/files/a/',
    '/api/files/a/b.txt',
    '/api/files/docs',
    '/api/files/docs/readme.md',
    '/api/mix/1/static',
    '/api/mix/static/1',
    '/api/a/b/c',
    '/api/a/1/c',
    '/api/1/deep',
    '/1',
    '/1/',
    '/1/extra',
    '/wild',
    '/wild/',
    '/wild/x/y',
    '/wild/static',
    '/encoded/caf%C3%A9',
    '/encoded/100%25',
    '/encoded/%E0%A4%A',
    '/encoded/a%2Fb',
    '/(group)/thing',
    '/unicode/日本語',
    '/unicode/%F0%9F%98%80',
    '//',
    '///',
    '/api//users',
    '/api/users//42',
    '/api/users/42//',
    '/api/users/42/posts/',
    '/API/USERS',
    '/nope',
    '/nope/',
    '/nope/deep/path',
    '/a/b/c/d/e',
    '/x y',
    '/café',
    '/users/日本',
    '/api/users/42/posts/7/extra',
];

describe('trie fuzz — radix vs legacy segment matcher', () => {
    it('kitchen-sink route set agrees on every targeted edge path', () => {
        const pair = buildPair(KITCHEN_SINK);
        const paths: string[] = [];
        for (const pathname of EDGE_PATHS) {
            paths.push(pathname);
            assertSameMatch(pair, pathname);
        }
        assertSamePatternSet(pair);
        assertSameRegexDecisions(pair, paths);
    });

    it('randomized route sets agree (seeded, 10k random paths)', () => {
        const rand = rng(0x5eed_c0de);
        const ROUTE_SETS = 50;
        const RANDOM_PATHS_PER_SET = 200;

        for (let set = 0; set < ROUTE_SETS; set++) {
            const routes = generateRouteSet(rand);
            const pair = buildPair(routes);
            const paths: string[] = [];

            // Targeted, route-derived paths.
            for (const route of routes) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    const pathname = derivedPath(route, rand);
                    paths.push(pathname);
                    assertSameMatch(pair, pathname);
                }
            }
            // A slice of the shared edge list keeps the run bounded.
            for (let i = set % 5; i < EDGE_PATHS.length; i += 5) {
                const pathname = EDGE_PATHS[i]!;
                paths.push(pathname);
                assertSameMatch(pair, pathname);
            }
            // Random paths.
            for (let i = 0; i < RANDOM_PATHS_PER_SET; i++) {
                const pathname = randomPath(rand);
                paths.push(pathname);
                assertSameMatch(pair, pathname);
            }
            assertSamePatternSet(pair);
            assertSameRegexDecisions(pair, paths);
        }
    });

    it('random unicode/encoded path fuzz also agrees', () => {
        const rand = rng(0xbadc0ffee);
        const pair = buildPair(KITCHEN_SINK);
        for (let i = 0; i < 2000; i++) {
            assertSameMatch(pair, randomPath(rand));
        }
    });

    it('ambiguous params and non-terminal wildcards throw identically', () => {
        const cases: [string, string][] = [
            ['/a/:x', '/a/:y'],
            ['/a/:x/b', '/a/:y/c'],
            ['/files/*', '/files/*/deep'],
        ];
        for (const paths of cases) {
            let currentError: string | undefined;
            let legacyError: string | undefined;
            const current = new Trie();
            const legacy = new LegacyTrie();
            for (const path of paths) {
                const route = makeRoute(path, ['GET']);
                try {
                    current.insert(
                        route.path,
                        route.handler,
                        route.methods,
                        route.isWildcard
                    );
                } catch (error) {
                    currentError ??= (error as Error).message;
                }
                try {
                    legacy.insert(
                        route.path,
                        route.handler,
                        route.methods,
                        route.isWildcard
                    );
                } catch (error) {
                    legacyError ??= (error as Error).message;
                }
            }
            const label = paths.join(' + ');
            expect(`${label} → ${currentError ?? 'no error'}`).toBe(
                `${label} → ${legacyError ?? 'no error'}`
            );
        }
    });
});
