/**
 * Session plugin: persistence, rotation, cookie flags, tamper rejection.
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
    it('persists a new session in the store and loads it on the next request', async () => {
        const store = new MemorySessionStore();
        const burger = makeBurger(session({ store, secret: 'test-secret-0123456789abcdef' }));
        const handler = await burger.fetchHandler();

        const r1 = await handler(new Request('http://localhost/api/count'));
        expect(r1.status).toBe(200);
        const id = signedIdFrom(r1.headers.get('Set-Cookie'));
        expect(await store.get(unsignedId(id))).toEqual({});

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

        const r1 = await handler(new Request('http://localhost/api/count'));
        const id1 = signedIdFrom(r1.headers.get('Set-Cookie'));

        const r2 = await handler(
            new Request('http://localhost/api/count', {
                headers: { Cookie: `session_id=${id1}` },
            })
        );
        const id2 = signedIdFrom(r2.headers.get('Set-Cookie'));
        expect(id2).not.toBe(id1);
        expect(await store.get(unsignedId(id2))).toEqual({ count: 1 });
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

        const r1 = await handler(new Request('http://localhost/api/count'));
        const id = signedIdFrom(r1.headers.get('Set-Cookie'));

        const r2 = await handler(
            new Request('http://localhost/api/count', {
                headers: { Cookie: `session_id=${id}` },
            })
        );
        expect(r2.headers.get('Set-Cookie')).toBeNull();
        expect(await store.get(unsignedId(id))).toEqual({ count: 1 });
    });

    it('sets HttpOnly always and Secure in production', async () => {
        const store = new MemorySessionStore();
        const prevEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const plugin = session({ store, secret: 'test-secret-0123456789abcdef' });
        process.env.NODE_ENV = prevEnv;
        const burger = makeBurger(plugin);
        const handler = await burger.fetchHandler();

        const r1 = await handler(new Request('http://localhost/api/count'));
        const cookie = r1.headers.get('Set-Cookie');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
    });

    it('rejects a tampered signature and issues a fresh session', async () => {
        const store = new MemorySessionStore();
        const burger = makeBurger(session({ store, secret: 'test-secret-0123456789abcdef' }));
        const handler = await burger.fetchHandler();

        const r1 = await handler(new Request('http://localhost/api/count'));
        const id = signedIdFrom(r1.headers.get('Set-Cookie'));
        const tampered = id.slice(0, -8) + 'deadbeef';

        const r2 = await handler(
            new Request('http://localhost/api/count', {
                headers: { Cookie: `session_id=${tampered}` },
            })
        );
        expect(await r2.json()).toEqual({ hasSession: false, count: 0 });
        expect(r2.headers.get('Set-Cookie')).toBeTruthy();
    });
});