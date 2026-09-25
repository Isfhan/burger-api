/**
 * JWT auth plugin: claims only after verification, exp/aud/iss enforcement,
 * secret strength.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import { jwtAuth } from '../../../../ecosystem/plugins/jwt-auth/jwt-auth';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const OTHER_SECRET = 'other-secret-0123456789abcdef0123456789abcdef';

function b64url(o: unknown): string {
    return btoa(JSON.stringify(o))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function sign(
    payload: object,
    secret = SECRET,
    opts: { alg?: string; signature?: string } = {}
): string {
    const header = b64url({ alg: opts.alg ?? 'HS256', typ: 'JWT' });
    const body = b64url(payload);
    const data = `${header}.${body}`;
    if (opts.signature) {
        return `${data}.${opts.signature}`;
    }
    const sig = new Bun.CryptoHasher('sha256', secret)
        .update(data)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return `${data}.${sig}`;
}

function nowSec(): number {
    return Math.floor(Date.now() / 1000);
}

async function run(
    options: Parameters<typeof jwtAuth>[0],
    path: string,
    init?: RequestInit
): Promise<Response> {
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
                handlers: {
                    GET: (ctx: unknown) =>
                        Response.json({ user: (ctx as { user?: unknown }).user ?? null }),
                },
                config: { auth: false },
                openapi: {},
            },
        ],
    });
    burger.usePlugin(jwtAuth(options));
    const handler = await burger.fetchHandler();
    return handler(new Request(`http://localhost${path}`, init));
}

const bearer = (token: string): RequestInit => ({
    headers: { Authorization: `Bearer ${token}` },
});

describe('jwt-auth', () => {
    it('rejects a short HMAC secret at startup', () => {
        expect(() => jwtAuth({ secret: 'short' })).toThrow(/at least 32 bytes/);
    });

    it('requires a secret or public key', () => {
        expect(() => jwtAuth({})).toThrow(/secret.*publicKey/);
    });

    it('401 without a token; 200 on auth-disabled routes', async () => {
        expect((await run({ secret: SECRET }, '/api/guarded')).status).toBe(401);
        expect((await run({ secret: SECRET }, '/api/open')).status).toBe(200);
    });

    it('auth-disabled routes never receive ctx.user claims, even with a valid token', async () => {
        const res = await run(
            { secret: SECRET },
            '/api/open',
            bearer(sign({ sub: 'user-123', exp: nowSec() + 600 }))
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ user: null });
    });

    it('attaches verified claims to ctx.user on guarded routes', async () => {
        const res = await run(
            { secret: SECRET },
            '/api/guarded',
            bearer(sign({ sub: 'user-123', role: 'admin', exp: nowSec() + 600 }))
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            user: { sub: 'user-123', role: 'admin', exp: expect.any(Number) },
        });
    });

    it('rejects a token signed with a different secret', async () => {
        const res = await run(
            { secret: SECRET },
            '/api/guarded',
            bearer(sign({ sub: 'user-123', exp: nowSec() + 600 }, OTHER_SECRET))
        );
        expect(res.status).toBe(401);
    });

    it('rejects a token whose alg claim does not match the configured algorithm', async () => {
        const res = await run(
            { secret: SECRET },
            '/api/guarded',
            bearer(sign({ sub: 'user-123', exp: nowSec() + 600 }, SECRET, { alg: 'none' }))
        );
        expect(res.status).toBe(401);
    });

    it('rejects tokens without an exp claim by default', async () => {
        const res = await run(
            { secret: SECRET },
            '/api/guarded',
            bearer(sign({ sub: 'user-123' }))
        );
        expect(res.status).toBe(401);
    });

    it('accepts tokens without exp when requireExpiration is false', async () => {
        const res = await run(
            { secret: SECRET, requireExpiration: false },
            '/api/guarded',
            bearer(sign({ sub: 'user-123' }))
        );
        expect(res.status).toBe(200);
    });

    it('rejects an expired token', async () => {
        const res = await run(
            { secret: SECRET },
            '/api/guarded',
            bearer(sign({ sub: 'user-123', exp: nowSec() - 10 }))
        );
        expect(res.status).toBe(401);
    });

    it('rejects exp == now (already expired)', async () => {
        const res = await run(
            { secret: SECRET },
            '/api/guarded',
            bearer(sign({ sub: 'user-123', exp: nowSec() }))
        );
        expect(res.status).toBe(401);
    });

    it('rejects non-numeric exp', async () => {
        const res = await run(
            { secret: SECRET },
            '/api/guarded',
            bearer(sign({ sub: 'user-123', exp: 'tomorrow' }))
        );
        expect(res.status).toBe(401);
    });

    it('rejects a missing or wrong audience when audience is configured', async () => {
        const opts = { secret: SECRET, audience: 'my-api' };
        expect(
            (await run(opts, '/api/guarded', bearer(sign({ sub: 'u', exp: nowSec() + 600 })))).status
        ).toBe(401);
        expect(
            (
                await run(
                    opts,
                    '/api/guarded',
                    bearer(sign({ sub: 'u', aud: 'other-api', exp: nowSec() + 600 }))
                )
            ).status
        ).toBe(401);
        expect(
            (
                await run(
                    opts,
                    '/api/guarded',
                    bearer(sign({ sub: 'u', aud: 'my-api', exp: nowSec() + 600 }))
                )
            ).status
        ).toBe(200);
    });

    it('rejects a missing or wrong issuer when issuer is configured', async () => {
        const opts = { secret: SECRET, issuer: 'https://issuer.example' };
        expect(
            (await run(opts, '/api/guarded', bearer(sign({ sub: 'u', exp: nowSec() + 600 })))).status
        ).toBe(401);
        expect(
            (
                await run(
                    opts,
                    '/api/guarded',
                    bearer(sign({ sub: 'u', iss: 'https://evil.example', exp: nowSec() + 600 }))
                )
            ).status
        ).toBe(401);
        expect(
            (
                await run(
                    opts,
                    '/api/guarded',
                    bearer(
                        sign({ sub: 'u', iss: 'https://issuer.example', exp: nowSec() + 600 })
                    )
                )
            ).status
        ).toBe(200);
    });
});