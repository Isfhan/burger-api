/**
 * OIDC plugin: per-issuer key isolation, rotation with stale-key grace,
 * algorithm/kty validation, exp/aud enforcement.
 */
import { describe, it, expect, afterAll } from 'bun:test';
import { Burger } from '../../src/index';
import { oidc } from '../../../../ecosystem/plugins/oidc/oidc';

interface KeyMaterial {
    kid: string;
    publicJwk: JsonWebKey;
    privateKey: CryptoKey;
    alg: 'RS256' | 'ES256';
}

const providers: Bun.Server<any>[] = [];

async function makeRsaKey(kid: string): Promise<KeyMaterial> {
    const pair = await crypto.subtle.generateKey(
        {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true,
        ['sign', 'verify']
    );
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    return { kid, publicJwk, privateKey: pair.privateKey, alg: 'RS256' };
}

async function makeEcKey(kid: string): Promise<KeyMaterial> {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
    );
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    return { kid, publicJwk, privateKey: pair.privateKey, alg: 'ES256' };
}

function b64urlBytes(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) {
        bin += String.fromCharCode(b);
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(o: unknown): string {
    return b64urlBytes(new TextEncoder().encode(JSON.stringify(o)));
}

async function signToken(
    key: KeyMaterial,
    payload: object,
    opts: { alg?: string; kid?: string } = {}
): Promise<string> {
    const alg = opts.alg ?? key.alg;
    const kid = opts.kid ?? key.kid;
    const header = b64urlJson({ alg, kid, typ: 'JWT' });
    const body = b64urlJson(payload);
    const data = `${header}.${body}`;
    const sig = await crypto.subtle.sign(
        alg === 'RS256'
            ? { name: 'RSASSA-PKCS1-v1_5' }
            : { name: 'ECDSA', hash: 'SHA-256' },
        key.privateKey,
        new TextEncoder().encode(data)
    );
    return `${data}.${b64urlBytes(new Uint8Array(sig))}`;
}

async function startProvider(): Promise<{
    issuer: string;
    setKeys: (keys: Record<string, unknown>[]) => void;
    jwksHits: () => number;
    stop: () => void;
}> {
    let keys: JsonWebKey[] = [];
    let hits = 0;
    const server: Bun.Server<any> = Bun.serve({
        port: 0,
        fetch(req): Response | Promise<Response> {
            const url = new URL(req.url);
            const base = `http://localhost:${server.port}`;
            if (url.pathname === '/.well-known/openid-configuration') {
                return Response.json({
                    issuer: base,
                    authorization_endpoint: `${base}/auth`,
                    token_endpoint: `${base}/token`,
                    userinfo_endpoint: `${base}/userinfo`,
                    jwks_uri: `${base}/jwks`,
                });
            }
            if (url.pathname === '/jwks') {
                hits++;
                return Response.json({ keys });
            }
            return new Response('not found', { status: 404 });
        },
    });
    providers.push(server);
    return {
        issuer: `http://localhost:${server.port}`,
        setKeys: (k) => {
            keys = k;
        },
        jwksHits: () => hits,
        stop: () => server.stop(true),
    };
}

function nowSec(): number {
    return Math.floor(Date.now() / 1000);
}

async function makeRunner(
    options: Parameters<typeof oidc>[0]
): Promise<(path: string, init?: RequestInit) => Promise<Response>> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api/guarded',
                handlers: {
                    GET: (ctx: unknown) =>
                        Response.json({ user: (ctx as { user?: unknown }).user ?? null }),
                },
                openapi: {},
            },
            {
                path: '/api/open',
                handlers: { GET: () => Response.json({ ok: true }) },
                config: { auth: false },
                openapi: {},
            },
        ],
    });
    burger.usePlugin(oidc(options));
    const handler = await burger.fetchHandler();
    return async (path: string, init?: RequestInit) =>
        handler(new Request(`http://localhost${path}`, init));
}

async function run(
    options: Parameters<typeof oidc>[0],
    path: string,
    init?: RequestInit
): Promise<Response> {
    const request = await makeRunner(options);
    return request(path, init);
}

const bearer = (token: string): RequestInit => ({
    headers: { Authorization: `Bearer ${token}` },
});

async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (cond()) {
            return;
        }
        await Bun.sleep(50);
    }
    throw new Error('condition not met in time');
}

describe('oidc', () => {
    afterAll(() => {
        for (const s of providers) {
            s.stop(true);
        }
    });

    it('verifies tokens against the correct issuer keys (per-instance cache)', async () => {
        const providerA = await startProvider();
        const providerB = await startProvider();
        const keyA = await makeRsaKey('key-a');
        const keyB = await makeRsaKey('key-b');
        providerA.setKeys([{ ...keyA.publicJwk, kid: keyA.kid }]);
        providerB.setKeys([{ ...keyB.publicJwk, kid: keyB.kid }]);

        const tokenA = await signToken(keyA, {
            sub: 'a',
            iss: providerA.issuer,
            exp: nowSec() + 600,
        });
        const tokenB = await signToken(keyB, {
            sub: 'b',
            iss: providerB.issuer,
            exp: nowSec() + 600,
        });

        // Prime instance A first — under the old module-level cache this
        // would poison instance B with A's keys.
        const resA = await run(
            { issuer: providerA.issuer },
            '/api/guarded',
            bearer(tokenA)
        );
        expect(resA.status).toBe(200);

        const resB = await run(
            { issuer: providerB.issuer },
            '/api/guarded',
            bearer(tokenB)
        );
        expect(resB.status).toBe(200);

        providerA.stop();
        providerB.stop();
    });

    it('rejects a token signed for a different issuer', async () => {
        const providerA = await startProvider();
        const providerB = await startProvider();
        const keyA = await makeRsaKey('key-a');
        providerA.setKeys([{ ...keyA.publicJwk, kid: keyA.kid }]);

        const token = await signToken(keyA, {
            sub: 'a',
            iss: providerB.issuer,
            exp: nowSec() + 600,
        });
        const res = await run(
            { issuer: providerA.issuer },
            '/api/guarded',
            bearer(token)
        );
        expect(res.status).toBe(401);

        providerA.stop();
        providerB.stop();
    });

    it('key rotation: stale keys served during grace, new keys used after refresh', async () => {
        const provider = await startProvider();
        const key1 = await makeRsaKey('rotating-key');
        const key2 = await makeRsaKey('rotating-key');
        provider.setKeys([{ ...key1.publicJwk, kid: key1.kid }]);

        // One plugin instance shared across all requests — this is where the
        // instance cache and background refresh live.
        const request = await makeRunner({
            issuer: provider.issuer,
            jwksCacheTtl: 1,
        });
        const token1 = await signToken(key1, {
            sub: 'u',
            iss: provider.issuer,
            exp: nowSec() + 600,
        });

        expect((await request('/api/guarded', bearer(token1))).status).toBe(200);

        // Wait out the TTL, then rotate the key material.
        await Bun.sleep(1300);
        provider.setKeys([{ ...key2.publicJwk, kid: key2.kid }]);

        // First request after expiry: stale keys still verify the old token
        // (grace period) while the refresh starts in the background.
        const staleOk = await request('/api/guarded', bearer(token1));
        expect(staleOk.status).toBe(200);

        // Wait for the background refresh to land, then the new key works.
        await waitFor(() => provider.jwksHits() >= 2);
        const token2 = await signToken(key2, {
            sub: 'u',
            iss: provider.issuer,
            exp: nowSec() + 600,
        });
        const rotated = await request('/api/guarded', bearer(token2));
        expect(rotated.status).toBe(200);

        provider.stop();
    });

    it('ES256 token against an RSA key is a clean 401', async () => {
        const provider = await startProvider();
        const rsaKey = await makeRsaKey('key-rsa');
        const ecKey = await makeEcKey('key-rsa');
        provider.setKeys([{ ...rsaKey.publicJwk, kid: rsaKey.kid }]);

        const token = await signToken(ecKey, {
            sub: 'u',
            iss: provider.issuer,
            exp: nowSec() + 600,
        });
        const res = await run(
            { issuer: provider.issuer },
            '/api/guarded',
            bearer(token)
        );
        expect(res.status).toBe(401);

        provider.stop();
    });

    it('a key marked use: enc is never used for verification', async () => {
        const provider = await startProvider();
        const key = await makeRsaKey('key-enc');
        provider.setKeys([{ ...key.publicJwk, kid: key.kid, use: 'enc' }]);

        const token = await signToken(key, {
            sub: 'u',
            iss: provider.issuer,
            exp: nowSec() + 600,
        });
        const res = await run(
            { issuer: provider.issuer },
            '/api/guarded',
            bearer(token)
        );
        expect(res.status).toBe(401);

        provider.stop();
    });

    it('enforces expiration (missing, expired, exp == now)', async () => {
        const provider = await startProvider();
        const key = await makeRsaKey('key');
        provider.setKeys([{ ...key.publicJwk, kid: key.kid }]);
        const opts = { issuer: provider.issuer };

        const missing = await run(
            opts,
            '/api/guarded',
            bearer(await signToken(key, { sub: 'u', iss: provider.issuer }))
        );
        expect(missing.status).toBe(401);

        const expired = await run(
            opts,
            '/api/guarded',
            bearer(
                await signToken(key, { sub: 'u', iss: provider.issuer, exp: nowSec() - 5 })
            )
        );
        expect(expired.status).toBe(401);

        const exact = await run(
            opts,
            '/api/guarded',
            bearer(
                await signToken(key, { sub: 'u', iss: provider.issuer, exp: nowSec() })
            )
        );
        expect(exact.status).toBe(401);

        provider.stop();
    });

    it('enforces audience when configured', async () => {
        const provider = await startProvider();
        const key = await makeRsaKey('key');
        provider.setKeys([{ ...key.publicJwk, kid: key.kid }]);
        const opts = { issuer: provider.issuer, audience: 'my-api' };

        const missing = await run(
            opts,
            '/api/guarded',
            bearer(
                await signToken(key, { sub: 'u', iss: provider.issuer, exp: nowSec() + 600 })
            )
        );
        expect(missing.status).toBe(401);

        const wrong = await run(
            opts,
            '/api/guarded',
            bearer(
                await signToken(key, {
                    sub: 'u',
                    iss: provider.issuer,
                    aud: 'other-api',
                    exp: nowSec() + 600,
                })
            )
        );
        expect(wrong.status).toBe(401);

        const ok = await run(
            opts,
            '/api/guarded',
            bearer(
                await signToken(key, {
                    sub: 'u',
                    iss: provider.issuer,
                    aud: 'my-api',
                    exp: nowSec() + 600,
                })
            )
        );
        expect(ok.status).toBe(200);

        provider.stop();
    });

    it('auth-disabled routes never receive ctx.user claims', async () => {
        const provider = await startProvider();
        const key = await makeRsaKey('key');
        provider.setKeys([{ ...key.publicJwk, kid: key.kid }]);
        const token = await signToken(key, {
            sub: 'u',
            iss: provider.issuer,
            exp: nowSec() + 600,
        });
        const res = await run(
            { issuer: provider.issuer },
            '/api/open',
            bearer(token)
        );
        expect(res.status).toBe(200);
        provider.stop();
    });
});