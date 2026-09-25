/**
 * RegExp matcher ↔ trie parity: the regex dispatch path must produce
 * identical routing decisions to the radix trie across randomized route
 * sets and targeted edge cases (trailing-slash empty params, wildcard base
 * hits, encoded segments, overlapping dynamic patterns).
 */
import { describe, it, expect } from 'bun:test';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';

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

interface Probe {
    handler: () => Response; // identity marker per route
    id: string;
}

const PROBES = new Map<string, Probe>();

function probeRoute(
    path: string
): RouteDefinition & { __id: string } {
    const id = `route:${path}`;
    const existing = PROBES.get(id);
    if (!existing) {
        PROBES.set(id, {
            id,
            handler: () => new Response(id, { status: 299 }),
        });
    }
    return {
        path,
        handlers: { GET: () => new Response(id, { status: 299 }) },
        isWildcard: path.includes('*'),
        __id: id,
    } as RouteDefinition & { __id: string };
}

async function resolve(
    defs: RouteDefinition[],
    engine: 'regex' | 'trie' | 'regex',
    method: string,
    urlPath: string
): Promise<{ status: number; body: string }> {
    const router = new Router({ engine });
    router.compile(defs.map((d) => ({ ...d })));
    const res = await router.fetch(
        new Request(`http://test${urlPath}`, { method })
    );
    const body =
        res.status === 299 ? await res.text() : `__status:${res.status}`;
    return { status: res.status, body };
}

describe('regex matcher — parity with trie', () => {
    it('targeted edge cases match exactly', async () => {
        const defs = [
            probeRoute('/api/users/:id'),
            probeRoute('/api/users/admin/settings'),
            probeRoute('/api/files/*'),
            probeRoute('/api/files/docs/*'),
            probeRoute('/api/x/:a/y/:b'),
            probeRoute('/api/x/static/y/z'),
            probeRoute('/api/enc/:name'),
        ];

        const paths = [
            '/api/users/42',
            '/api/users/', // empty param via trailing slash
            '/api/users',
            '/api/users/admin', // no such route (admin has /settings child)
            '/api/users/admin/settings',
            '/api/files', // wildcard base hit → []
            '/api/files/', // wildcard with trailing slash → ['']
            '/api/files/a/b/c.txt',
            '/api/files/docs/readme.md',
            '/api/files/docs', // docs/* base hit
            '/api/x/1/y/2',
            '/api/x/static/y/z',
            '/api/x/q/y/w',
            '/api/enc/j%C3%BCrgen', // percent-encoded segment decoded
            '/api/enc/a/b', // too many segments → 404
            '/nope',
        ];

        for (const p of paths) {
            for (const method of ['GET', 'POST']) {
                const a = await resolve(defs, 'trie', method, p);
                const b = await resolve(defs, 'regex', method, p);
                expect(`[${method}] ${p} → ${JSON.stringify(b)}`).toBe(
                    `[${method}] ${p} → ${JSON.stringify(a)}`
                );
            }
        }
    });

    it('randomized route sets and paths agree (seeded fuzz)', async () => {
        const rand = rng(1337);
        const LITERALS = ['a', 'bb', 'users', 'v2', 'x-y'];
        const METHODS = ['GET', 'POST'];

        for (let round = 0; round < 25; round++) {
            const defs: RouteDefinition[] = [];
            const seen = new Set<string>();
            const count = 4 + Math.floor(rand() * 8);

            while (defs.length < count) {
                const depth = 1 + Math.floor(rand() * 3);
                const segs: string[] = [];
                for (let d = 0; d < depth; d++) {
                    const roll = rand();
                    if (roll < 0.3) segs.push(':d' + d);
                    else if (roll < 0.38 && d === depth - 1) segs.push('*');
                    else
                        segs.push(
                            LITERALS[Math.floor(rand() * LITERALS.length)]!
                        );
                }
                const path = '/' + segs.join('/');
                if (seen.has(path)) continue;
                seen.add(path);
                defs.push(probeRoute(path));
            }

            const testPaths: string[] = [];
            for (let i = 0; i < 20; i++) {
                const def = defs[Math.floor(rand() * defs.length)]!;
                let path = def.path.replace(/\*$/, '');
                path = path.replace(/:[a-zA-Z0-9_]+/g, () =>
                    rand() < 0.15
                        ? ''
                        : 'v' + Math.floor(rand() * 100)
                );
                if (rand() < 0.2 && !path.endsWith('/')) path += '/';
                if (rand() < 0.1) path = '/ghost' + path;
                if (!testPaths.includes(path)) testPaths.push(path);
            }

            for (const p of testPaths) {
                const method = METHODS[Math.floor(rand() * METHODS.length)]!;
                const a = await resolve(defs, 'trie', method, p);
                const b = await resolve(defs, 'regex', method, p);
                const divergence =
                    a.body !== b.body || a.status !== b.status;
                if (divergence) {
                    console.error(
                        `[parity] round ${round} [${method}] ${p}\n` +
                            `  trie : ${JSON.stringify(a)}\n` +
                            `  regex: ${JSON.stringify(b)}\n` +
                            `  routes: ${defs.map((d) => d.path).join(', ')}`
                    );
                }
                expect(b.body).toBe(a.body);
                expect(b.status).toBe(a.status);
            }
        }
    });

    it('405 + Allow behavior is identical between engines', async () => {
        const defs = [
            {
                path: '/api/things/:id',
                handlers: {
                    GET: () => new Response('get', { status: 200 }),
                    POST: () => new Response('post', { status: 200 }),
                },
                isWildcard: false,
            },
            probeRoute('/api/wild/*'),
        ] as RouteDefinition[];

        for (const url of ['/api/things/9', '/api/wild/x']) {
            const a = await resolve(defs, 'trie', 'DELETE', url);
            const b = await resolve(defs, 'regex', 'DELETE', url);
            expect(b.body).toBe(a.body);
            expect(b.status).toBe(405);
            expect(a.body.startsWith('__status:405')).toBe(true);
        }
    });

    it('engine "regex" and "trie" flags are honored', async () => {
        const defs = [probeRoute('/api/n/:id')];
        // Both engines still route the same request identically.
        const t = await resolve(defs, 'trie', 'GET', '/api/n/1');
        const r = await resolve(defs, 'regex', 'GET', '/api/n/1');
        expect(r.body).toBe(t.body);
        expect(r.body).toContain('/api/n/:id');
    });

    it('builder bails out gracefully beyond the size cap (trie fallback)', async () => {
        // > MAX_ROUTES entries must not blow up compile or dispatch.
        const defs: RouteDefinition[] = [];
        for (let i = 0; i < 5001; i++) {
            defs.push(probeRoute(`/bulk/r${i}/:id`));
        }
        const a = await resolve(defs.slice(0, 10), 'regex', 'GET', '/bulk/r0/v');
        expect(a.status).toBe(299); // probe marker status

        // Full oversized set: both engines must agree on one probe path.
        const t = await resolve(defs, 'trie', 'GET', '/bulk/r5000/v');
        const b = await resolve(defs, 'regex', 'GET', '/bulk/r5000/v');
        expect(b.body).toBe(t.body);
    });
});
