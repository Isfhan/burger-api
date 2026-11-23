/**
 * Ecosystem correctness probes: route roles across auth plugins, OIDC key
 * rotation, compression skips, Vary merging, body limits by body presence,
 * UTF-8 Basic credentials, and logger body capture.
 */
import { describe, it, expect, afterAll } from 'bun:test';
import { Burger } from '../../src/index';
import { jwtAuth, signJwt } from '../../../../ecosystem/plugins/jwt-auth/jwt-auth';
import { basicAuth } from '../../../../ecosystem/plugins/basic-auth/basic-auth';
import { apiKey } from '../../../../ecosystem/plugins/api-key/api-key';
import { session, MemorySessionStore } from '../../../../ecosystem/plugins/session/session';
import { oidc } from '../../../../ecosystem/plugins/oidc/oidc';
import { compress } from '../../../../ecosystem/hooks/compression/compression';
import { cors } from '../../../../ecosystem/hooks/cors/cors';
import { cacheControl } from '../../../../ecosystem/hooks/cache/cache';
import { bodySizeLimiter } from '../../../../ecosystem/hooks/body-size-limiter/body-size-limiter';
import { createLogger } from '../../../../ecosystem/hooks/logger/logger';
import type { Plugin } from '../../src/plugin/types';
import type { ForwardHook } from '../../src/lifecycle/types';
import type { HTTPMethod } from '../../src/utils/routing';
import type { RequestHandler } from '../../src/types/index';

// Hook factories return `Hook`; route `beforeRoute` takes `ForwardHook`.
function asForwardHook(hook: unknown): ForwardHook {
    return hook as ForwardHook;
}

interface AppOptions {
    handlers?: Partial<Record<HTTPMethod, RequestHandler>>;
    hooks?: unknown[];
    config?: Record<string, unknown>;
    plugin?: Plugin;
}

async function app(
    opts: AppOptions
): Promise<(path: string, init?: RequestInit) => Promise<Response>> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api',
                handlers: opts.handlers ?? { GET: () => Response.json({ ok: true }) },
                hooks: opts.hooks
                    ? { beforeRoute: opts.hooks.map(asForwardHook) }
                    : undefined,
                config: opts.config,
                openapi: {},
            },
        ],
    });
    if (opts.plugin) {
        burger.usePlugin(opts.plugin);
    }
    const handler = await burger.fetchHandler();
    return (path, init) => handler(new Request(`http://localhost${path}`, init));
}

const adminOnly = { auth: { required: true, roles: ['admin'] } };
const big = 'x'.repeat(5000);

describe('jwt-auth roles', () => {
    const secret = 'a'.repeat(40);

    it('a non-array roles claim never matches by substring', async () => {
        const run = await app({ config: adminOnly, plugin: jwtAuth({ secret }) });
        const token = await signJwt(
            { sub: 'u', roles: 'not-an-admin' as unknown as string[] },
            { secret, expiresIn: 60 }
        );
        const res = await run('/api', { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(403);
    });

    it('an array roles claim with the role passes', async () => {
        const run = await app({ config: adminOnly, plugin: jwtAuth({ secret }) });
        const token = await signJwt({ sub: 'u', roles: ['admin'] }, { secret, expiresIn: 60 });
        const res = await run('/api', { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(200);
    });
});

describe('basic-auth roles', () => {
    const plugin = (roles: unknown) =>
        basicAuth({
            validate: async (username) => ({ id: '1', username, roles: roles as string[] }),
        });
    const auth = { headers: { Authorization: `Basic ${btoa('bob:x')}` } };

    it('rejects a user without a listed role with 403', async () => {
        const run = await app({ config: adminOnly, plugin: plugin(['user']) });
        expect((await run('/api', auth)).status).toBe(403);
    });

    it('treats a non-array roles value as no roles', async () => {
        const run = await app({ config: adminOnly, plugin: plugin('admin-not') });
        expect((await run('/api', auth)).status).toBe(403);
    });

    it('allows a user with a listed role', async () => {
        const run = await app({ config: adminOnly, plugin: plugin(['admin']) });
        expect((await run('/api', auth)).status).toBe(200);
    });

    it('still challenges a missing login with 401', async () => {
        const run = await app({ config: adminOnly, plugin: plugin(['admin']) });
        expect((await run('/api')).status).toBe(401);
    });
});

describe('basic-auth UTF-8 credentials', () => {
    const plugin = () =>
        basicAuth({
            validate: async (u, p) =>
                u === 'jürgen' && p === 'pässword' ? { id: '1', username: u } : null,
        });

    it('decodes non-ASCII usernames and passwords as UTF-8', async () => {
        const run = await app({ plugin: plugin() });
        const cred = Buffer.from('jürgen:pässword', 'utf8').toString('base64');
        const res = await run('/api', { headers: { Authorization: `Basic ${cred}` } });
        expect(res.status).toBe(200);
    });

    it('still rejects malformed base64', async () => {
        const run = await app({ plugin: plugin() });
        const res = await run('/api', { headers: { Authorization: 'Basic !!!not-base64' } });
        expect(res.status).toBe(401);
    });
});

describe('api-key roles', () => {
    it('fails closed with 403 on a route that lists roles', async () => {
        const run = await app({ config: adminOnly, plugin: apiKey({ keys: ['k1'] }) });
        expect((await run('/api', { headers: { 'X-API-Key': 'k1' } })).status).toBe(403);
    });

    it('a missing key is still 401', async () => {
        const run = await app({ config: adminOnly, plugin: apiKey({ keys: ['k1'] }) });
        expect((await run('/api')).status).toBe(401);
    });

    it('a route without roles still passes', async () => {
        const run = await app({ config: { auth: { required: true } }, plugin: apiKey({ keys: ['k1'] }) });
        expect((await run('/api', { headers: { 'X-API-Key': 'k1' } })).status).toBe(200);
    });
});

describe('session roles', () => {
    async function withSession(config: Record<string, unknown>): Promise<Response> {
        const store = new MemorySessionStore();
        await store.set('sid1', { userId: 'u1', roles: ['admin'] });
        const run = await app({ config, plugin: session({ store }) });
        return run('/api', { headers: { Cookie: 'session_id=sid1' } });
    }

    it('fails closed with 403 on a route that lists roles', async () => {
        expect((await withSession(adminOnly)).status).toBe(403);
    });

    it('a route without roles still passes', async () => {
        expect((await withSession({ auth: { required: true } })).status).toBe(200);
    });
});

describe('oidc', () => {
    const servers: Bun.Server<any>[] = [];
    afterAll(() => {
        for (const s of servers) {
            s.stop(true);
        }
    });

    async function ecKey(kid: string) {
        const pair = await crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign', 'verify']
        );
        const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
        return { kid, jwk: { ...jwk, kid, use: 'sig', alg: 'ES256' }, privateKey: pair.privateKey };
    }

    const b64 = (v: string | Uint8Array) => Buffer.from(v).toString('base64url');

    async function sign(
        key: { kid: string; privateKey: CryptoKey },
        payload: Record<string, unknown>,
        kid = key.kid
    ): Promise<string> {
        const data = `${b64(JSON.stringify({ alg: 'ES256', kid }))}.${b64(JSON.stringify(payload))}`;
        const sig = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            key.privateKey,
            new TextEncoder().encode(data)
        );
        return `${data}.${b64(new Uint8Array(sig))}`;
    }

    function provider() {
        let keys: unknown[] = [];
        let hits = 0;
        const server: Bun.Server<any> = Bun.serve({
            port: 0,
            hostname: '127.0.0.1',
            fetch(req) {
                const base = `http://127.0.0.1:${server.port}`;
                if (new URL(req.url).pathname === '/jwks') {
                    hits++;
                    return Response.json({ keys });
                }
                return Response.json({ issuer: base, jwks_uri: `${base}/jwks` });
            },
        });
        servers.push(server);
        return {
            issuer: `http://127.0.0.1:${server.port}`,
            setKeys: (k: unknown[]) => {
                keys = k;
            },
            hits: () => hits,
        };
    }

    const exp = () => Math.floor(Date.now() / 1000) + 60;
    const bearer = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

    it('refetches JWKS once on an unknown kid, rate-limited', async () => {
        const idp = provider();
        const k1 = await ecKey('k1');
        const k2 = await ecKey('k2');
        idp.setKeys([k1.jwk]);
        const run = await app({ plugin: oidc({ issuer: idp.issuer }) });

        expect((await run('/api', bearer(await sign(k1, { iss: idp.issuer, exp: exp() })))).status).toBe(200);
        expect(idp.hits()).toBe(1);

        // The IdP rotates in a new key before the cache TTL expires.
        idp.setKeys([k1.jwk, k2.jwk]);
        expect((await run('/api', bearer(await sign(k2, { iss: idp.issuer, exp: exp() })))).status).toBe(200);
        expect(idp.hits()).toBe(2);

        // Forged kids right after do not trigger more fetches.
        for (let i = 0; i < 3; i++) {
            const forged = await sign(k2, { iss: idp.issuer, exp: exp() }, `forged-${i}`);
            expect((await run('/api', bearer(forged))).status).toBe(401);
        }
        expect(idp.hits()).toBe(2);
    });

    it('enforces route roles from the roles claim', async () => {
        const idp = provider();
        const k1 = await ecKey('k1');
        idp.setKeys([k1.jwk]);
        const run = await app({ config: adminOnly, plugin: oidc({ issuer: idp.issuer }) });
        const status = async (roles: unknown) =>
            (await run('/api', bearer(await sign(k1, { iss: idp.issuer, exp: exp(), roles })))).status;

        expect(await status(['user'])).toBe(403);
        expect(await status('not-an-admin')).toBe(403);
        expect(await status(['admin'])).toBe(200);
    });
});

describe('compression skips', () => {
    const gzip = { headers: { 'Accept-Encoding': 'gzip' } };

    it('passes a never-ending SSE stream through uncompressed', async () => {
        const run = await app({
            handlers: {
                GET: () =>
                    new Response(
                        new ReadableStream({
                            start(c) {
                                c.enqueue(new TextEncoder().encode(`data: ${big}\n\n`));
                            },
                        }),
                        { headers: { 'Content-Type': 'text/event-stream' } }
                    ),
            },
            hooks: [compress()],
        });
        const res = await Promise.race([
            run('/api', gzip),
            new Promise<null>((r) => setTimeout(() => r(null), 1000)),
        ]);
        expect(res).not.toBeNull();
        expect(res!.headers.get('Content-Encoding')).toBeNull();
        await res!.body?.cancel();
    });

    it('skips Cache-Control: no-transform', async () => {
        const run = await app({
            handlers: {
                GET: () =>
                    new Response(big, {
                        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, no-transform' },
                    }),
            },
            hooks: [compress()],
        });
        const res = await run('/api', gzip);
        expect(res.headers.get('Content-Encoding')).toBeNull();
        expect(await res.text()).toBe(big);
    });

    it('skips 206 partial content', async () => {
        const run = await app({
            handlers: {
                GET: () =>
                    new Response(big, {
                        status: 206,
                        headers: { 'Content-Type': 'text/plain', 'Content-Range': 'bytes 0-4999/10000' },
                    }),
            },
            hooks: [compress()],
        });
        const res = await run('/api', gzip);
        expect(res.status).toBe(206);
        expect(res.headers.get('Content-Encoding')).toBeNull();
    });

    it('still compresses a plain large body', async () => {
        const run = await app({
            handlers: { GET: () => new Response(big, { headers: { 'Content-Type': 'text/plain' } }) },
            hooks: [compress()],
        });
        const res = await run('/api', gzip);
        expect(res.headers.get('Content-Encoding')).toBe('gzip');
    });
});

describe('Vary merging', () => {
    const textHandler = { GET: () => new Response(big, { headers: { 'Content-Type': 'text/plain' } }) };
    const req = { headers: { Origin: 'https://a.com', 'Accept-Encoding': 'gzip' } };

    function varyTokens(res: Response): string[] {
        return (res.headers.get('Vary') ?? '')
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .sort();
    }

    it('cors then compression keeps both tokens', async () => {
        const run = await app({ handlers: textHandler, hooks: [cors({ origin: ['https://a.com'] }), compress()] });
        expect(varyTokens(await run('/api', req))).toEqual(['accept-encoding', 'origin']);
    });

    it('compression then cors keeps both tokens', async () => {
        const run = await app({ handlers: textHandler, hooks: [compress(), cors({ origin: ['https://a.com'] })] });
        expect(varyTokens(await run('/api', req))).toEqual(['accept-encoding', 'origin']);
    });

    it('cache vary merges with compression', async () => {
        const run = await app({
            handlers: textHandler,
            hooks: [compress(), cacheControl({ directive: 'public', maxAge: 60, vary: 'Authorization' })],
        });
        expect(varyTokens(await run('/api', req))).toEqual(['accept-encoding', 'authorization']);
    });

    it('de-duplicates case-insensitively and keeps *', async () => {
        const dup = await app({
            handlers: { GET: () => new Response('ok', { headers: { Vary: 'origin' } }) },
            hooks: [cors({ origin: ['https://a.com'] })],
        });
        expect((await dup('/api', req)).headers.get('Vary')).toBe('origin');

        const star = await app({
            handlers: { GET: () => new Response('ok', { headers: { Vary: '*' } }) },
            hooks: [cors({ origin: ['https://a.com'] }), cacheControl({ vary: 'Authorization' })],
        });
        expect((await star('/api', req)).headers.get('Vary')).toBe('*');
    });
});

describe('body-size-limiter by body presence', () => {
    const echo = { DELETE: async (ctx: { text(): Promise<string> }) => new Response(`read ${(await ctx.text()).length}`) };

    it('limits a DELETE body', async () => {
        const run = await app({
            handlers: echo as unknown as AppOptions['handlers'],
            hooks: [bodySizeLimiter({ maxSize: 10 })],
        });
        const res = await run('/api', {
            method: 'DELETE',
            body: 'y'.repeat(100_000),
            headers: { 'Content-Length': '100000' },
        });
        expect(res.status).toBe(413);
    });

    it('limits a DELETE body in stream mode', async () => {
        const run = await app({
            handlers: echo as unknown as AppOptions['handlers'],
            hooks: [bodySizeLimiter({ maxSize: 10, mode: 'stream' })],
        });
        const res = await run('/api', { method: 'DELETE', body: 'y'.repeat(100_000) });
        expect(res.status).toBe(413);
    });

    it('lets a bodiless GET and DELETE through', async () => {
        const run = await app({
            handlers: { GET: () => new Response('ok'), DELETE: () => new Response('ok') },
            hooks: [bodySizeLimiter({ maxSize: 10 })],
        });
        expect((await run('/api')).status).toBe(200);
        expect((await run('/api', { method: 'DELETE' })).status).toBe(200);
    });
});

describe('logger logBody', () => {
    async function logged(handler: RequestHandler): Promise<Record<string, unknown>> {
        const lines: string[] = [];
        const run = await app({
            handlers: { POST: handler },
            hooks: [createLogger({ logBody: true, format: 'json', colors: false, logFn: (m: string) => lines.push(m) })],
        });
        const res = await run('/api', {
            method: 'POST',
            body: JSON.stringify({ a: 1 }),
            headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status).toBe(200);
        expect(lines.length).toBe(1);
        return JSON.parse(lines[0]!);
    }

    it('logs the body after the handler read it', async () => {
        const entry = await logged(async (ctx) => {
            await ctx.json();
            return new Response('ok');
        });
        expect(entry.body).toEqual({ a: 1 });
    });

    it('logs the body after the handler read the raw request', async () => {
        const entry = await logged(async (ctx) => {
            await ctx.request.text();
            return new Response('ok');
        });
        expect(entry.body).toEqual({ a: 1 });
    });
});

describe('empty roles list means no role required', () => {
    // The framework core treats `roles: []` like no roles at all.
    const noRoles = { auth: { required: true, roles: [] as string[] } };
    const servers: Bun.Server<any>[] = [];
    afterAll(() => {
        for (const s of servers) {
            s.stop(true);
        }
    });

    it('jwt-auth allows a token without a listed role', async () => {
        const secret = 'b'.repeat(40);
        const run = await app({ config: noRoles, plugin: jwtAuth({ secret }) });
        const token = await signJwt(
            { sub: 'u', roles: ['user'] },
            { secret, expiresIn: 60 }
        );
        expect(
            (await run('/api', { headers: { Authorization: `Bearer ${token}` } })).status
        ).toBe(200);
    });

    it('basic-auth allows a user without a listed role', async () => {
        const run = await app({
            config: noRoles,
            plugin: basicAuth({
                validate: async (username) => ({ id: '1', username, roles: ['user'] }),
            }),
        });
        const auth = { headers: { Authorization: `Basic ${btoa('bob:x')}` } };
        expect((await run('/api', auth)).status).toBe(200);
    });

    it('api-key does not fail closed', async () => {
        const run = await app({ config: noRoles, plugin: apiKey({ keys: ['k1'] }) });
        expect((await run('/api', { headers: { 'X-API-Key': 'k1' } })).status).toBe(200);
    });

    it('session does not fail closed', async () => {
        const store = new MemorySessionStore();
        await store.set('sid1', { userId: 'u1', roles: ['admin'] });
        const run = await app({ config: noRoles, plugin: session({ store }) });
        expect((await run('/api', { headers: { Cookie: 'session_id=sid1' } })).status).toBe(200);
    });

    it('oidc allows a token without a listed role', async () => {
        const pair = await crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign', 'verify']
        );
        const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
        const kid = 'k1';
        const server: Bun.Server<any> = Bun.serve({
            port: 0,
            hostname: '127.0.0.1',
            fetch(req) {
                const base = `http://127.0.0.1:${server.port}`;
                if (new URL(req.url).pathname === '/jwks') {
                    return Response.json({
                        keys: [{ ...jwk, kid, use: 'sig', alg: 'ES256' }],
                    });
                }
                return Response.json({ issuer: base, jwks_uri: `${base}/jwks` });
            },
        });
        servers.push(server);

        const issuer = `http://127.0.0.1:${server.port}`;
        const b64 = (v: string | Uint8Array) => Buffer.from(v).toString('base64url');
        const data = `${b64(JSON.stringify({ alg: 'ES256', kid }))}.${b64(
            JSON.stringify({
                iss: issuer,
                exp: Math.floor(Date.now() / 1000) + 60,
                roles: ['user'],
            })
        )}`;
        const sig = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            pair.privateKey,
            new TextEncoder().encode(data)
        );
        const token = `${data}.${b64(new Uint8Array(sig))}`;

        const run = await app({ config: noRoles, plugin: oidc({ issuer }) });
        expect(
            (await run('/api', { headers: { Authorization: `Bearer ${token}` } })).status
        ).toBe(200);
    });
});
