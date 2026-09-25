/**
 * Session plugin: lazy creation, persistence of handler-set data, rotation,
 * cookie flags, tamper rejection.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import {
    session,
    MemorySessionStore,
} from '../../../../ecosystem/plugins/session/session';

interface SessionCtx {
    session?: Record<string, unknown>;
}

function makeBurger(plugin: ReturnType<typeof session>) {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api/count',
                handlers: {
                    GET: (ctx: unknown) => {
                        const s = (ctx as SessionCtx).session;
                        if (s) {
                            s.count = ((s.count as number) ?? 0) + 1;
                        }
                        return Response.json({
                            hasSession: !!s,
                            count: (s?.count as number) ?? 0,
                        });
                    },
                },
                config: { auth: false },
                openapi: {},
            },
            {
                path: '/api/peek',
                handlers: {
                    GET: (ctx: unknown) => {
                        const s = (ctx as SessionCtx).session;
                        return Response.json({ hasSession: !!s });
                    },
                },
                config: { auth: false },
                openapi: {},
            },
            {
                path: '/api/login',
                handlers: {
                    POST: (ctx: unknown) => {
                        (ctx as SessionCtx).session = { userId: 'u1' };
                        return Response.json({ ok: true });
                    },
                },
                config: { auth: false },
                openapi: {},
            },
            {
                path: '/api/logout',
                handlers: {
                    POST: (ctx: unknown) => {
                        (ctx as SessionCtx).session = undefined;
                        return Response.json({ ok: true });
                    },
                },
                config: { auth: false },
                openapi: {},
            },
        ],
    });
    burger.usePlugin(plugin);
    return burger;
}

function signedIdFrom(setCookie: string | null): string {
    expect(setCookie).toBeTruthy();
    return setCookie!.split(';')[0]!.split('=')[1]!;
}

function unsignedId(signed: string): string {
    return signed.split('.')[0]!;
}

describe('session plugin', () => {
    it('creates no session entry or cookie for requests that never touch it', async () => {
        const store = new MemorySessionStore();
        const burger = makeBurger(session({ store, secret: 'test-secret-0123456789abcdef' }));
        const handler = await burger.fetchHandler();

        for (const path of ['/api/peek', '/api/count', '/api/peek']) {
            const res = await handler(new Request(`http://localhost${path}`));
            expect(res.status).toBe(200);
            expect(res.headers.get('Set-Cookie')).toBeNull();
        }
        const peek = await handler(new Request('http://localhost/api/peek'));
        expect(await peek.json()).toEqual({ hasSession: false });
    });

    it('persists what the handler set on a new session and loads it next request', async () => {
        const store = new MemorySessionStore();
        const burger = makeBurger(session({ store, secret: 'test-secret-0123456789abcdef' }));
        const handler = await burger.fetchHandler();

        const login = await handler(
            new Request('http://localhost/api/login', { method: 'POST' })
        );
        expect(login.status).toBe(200);
        const id = signedIdFrom(login.headers.get('Set-Cookie'));
        expect(await store.get(unsignedId(id))).toEqual({ userId: 'u1' });

        const r2 = await handler(
            new Request('http://localhost/api/count', {
                headers: { Cookie: `session_id=${id}` },
            })
        );
        expect(await r2.json()).toEqual({ hasSession: true, count: 1 });
    });

    it('rotates the ID only when session data changes, migrating data', async () => {
        const store = new MemorySessionStore();
        const burger = makeBurger(session({ store, secret: 'test-secret-0123456789abcdef' }));
        const handler = await burger.fetchHandler();

        const login = await handler(
            new Request('http://localhost/api/login', { method: 'POST' })
        );
        const id1 = signedIdFrom(login.headers.get('Set-Cookie'));

        const r2 = await handler(
            new Request('http://localhost/api/count', {
                headers: { Cookie: `session_id=${id1}` },
            })
        );
        const id2 = signedIdFrom(r2.headers.get('Set-Cookie'));
        expect(id2).not.toBe(id1);
        expect(await store.get(unsignedId(id2))).toEqual({ userId: 'u1', count: 1 });
        expect(await store.get(unsignedId(id1))).toBeNull();

        const r3 = await handler(
            new Request('http://localhost/api/peek', {
                headers: { Cookie: `session_id=${id2}` },
            })
        );
        expect(await r3.json()).toEqual({ hasSession: true });
        expect(r3.headers.get('Set-Cookie')).toBeNull();
    });

    it('keeps the same ID when regenerateOnAuth is false', async () => {
        const store = new MemorySessionStore();
        const burger = makeBurger(
            session({ store, secret: 'test-secret-0123456789abcdef', regenerateOnAuth: false })
        );
        const handler = await burger.fetchHandler();

        const login = await handler(
            new Request('http://localhost/api/login', { method: 'POST' })
        );
        const id = signedIdFrom(login.headers.get('Set-Cookie'));

        const r2 = await handler(
            new Request('http://localhost/api/count', {
                headers: { Cookie: `session_id=${id}` },
            })
        );
        expect(r2.headers.get('Set-Cookie')).toBeNull();
        expect(await store.get(unsignedId(id))).toEqual({ userId: 'u1', count: 1 });
    });

    it('sets HttpOnly always and Secure in production', async () => {
        const store = new MemorySessionStore();
        const prevEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const plugin = session({ store, secret: 'test-secret-0123456789abcdef' });
        process.env.NODE_ENV = prevEnv;
        const burger = makeBurger(plugin);
        const handler = await burger.fetchHandler();

        const login = await handler(
            new Request('http://localhost/api/login', { method: 'POST' })
        );
        const cookie = login.headers.get('Set-Cookie');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
    });

    it('rejects a tampered signature and treats the request as session-less', async () => {
        const store = new MemorySessionStore();
        const burger = makeBurger(session({ store, secret: 'test-secret-0123456789abcdef' }));
        const handler = await burger.fetchHandler();

        const login = await handler(
            new Request('http://localhost/api/login', { method: 'POST' })
        );
        const id = signedIdFrom(login.headers.get('Set-Cookie'));
        const tampered = id.slice(0, -8) + 'deadbeef';

        const peek = await handler(
            new Request('http://localhost/api/peek', {
                headers: { Cookie: `session_id=${tampered}` },
            })
        );
        expect(await peek.json()).toEqual({ hasSession: false });
        expect(peek.headers.get('Set-Cookie')).toBeNull();

        // Recoverable: logging in again still creates a fresh session.
        const relogin = await handler(
            new Request('http://localhost/api/login', { method: 'POST' })
        );
        expect(relogin.headers.get('Set-Cookie')).toBeTruthy();
    });

    it('destroys the session and expires the cookie on logout', async () => {
        const store = new MemorySessionStore();
        const burger = makeBurger(session({ store, secret: 'test-secret-0123456789abcdef' }));
        const handler = await burger.fetchHandler();

        const login = await handler(
            new Request('http://localhost/api/login', { method: 'POST' })
        );
        const id = signedIdFrom(login.headers.get('Set-Cookie'));
        expect(await store.get(unsignedId(id))).toEqual({ userId: 'u1' });

        const logout = await handler(
            new Request('http://localhost/api/logout', {
                method: 'POST',
                headers: { Cookie: `session_id=${id}` },
            })
        );
        expect(logout.status).toBe(200);
        expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
        expect(await store.get(unsignedId(id))).toBeNull();
    });
});
