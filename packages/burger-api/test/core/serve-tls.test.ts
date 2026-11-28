/**
 * `new Burger({ tls })` serves HTTPS (and WSS) from `serve()` on Bun:
 * static API routes, dynamic routes, pages and WebSocket routes.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import { join } from 'node:path';
import { Burger } from '../../src/index';
import type { BurgerWS } from '../../src/ws/types';
import { freePort } from '../free-port';

const dir = join(import.meta.dir, '..', 'fixtures', 'tls');
const tls = {
    cert: Bun.file(join(dir, 'cert.pem')),
    key: Bun.file(join(dir, 'key.pem')),
};
// The fixture certificate is self-signed.
const insecure = { tls: { rejectUnauthorized: false } } as RequestInit;

const apps: Burger[] = [];
afterEach(() => {
    while (apps.length > 0) apps.pop()!.getServer()?.stop();
});

function makeApp(): Burger {
    const app = new Burger({
        tls,
        apiRoutes: [
            {
                path: '/api/hello',
                handlers: { GET: () => Response.json({ hello: 'tls' }) },
            },
            {
                path: '/api/users/:id',
                handlers: {
                    GET: (ctx: any) => Response.json({ id: ctx.params.id }),
                },
            },
        ],
        pageRoutes: [
            {
                path: '/page',
                handler: () =>
                    new Response('<h1>secure page</h1>', {
                        headers: { 'Content-Type': 'text/html' },
                    }),
            },
        ],
        wsRoutes: [
            {
                path: '/ws/echo',
                handlers: {
                    message(ws: BurgerWS, message: string | Buffer) {
                        ws.send(`echo:${message.toString()}`);
                    },
                },
            },
        ],
    });
    apps.push(app);
    return app;
}

describe('serve() with tls', () => {
    it('serves API routes, dynamic routes and pages over https', async () => {
        const port = freePort();
        await makeApp().serve(port, () => {});
        const base = `https://localhost:${port}`;

        const hello = await fetch(`${base}/api/hello`, insecure);
        expect(await hello.json()).toEqual({ hello: 'tls' });

        const user = await fetch(`${base}/api/users/42`, insecure);
        expect(await user.json()).toEqual({ id: '42' });

        const page = await fetch(`${base}/page`, insecure);
        expect(await page.text()).toBe('<h1>secure page</h1>');
    });

    it('does not answer plain http', async () => {
        const port = freePort();
        await makeApp().serve(port, () => {});
        const res = await fetch(`http://localhost:${port}/api/hello`).catch(
            () => null
        );
        expect(res?.ok ?? false).toBe(false);
    });

    it('serves WebSocket routes over wss', async () => {
        const port = freePort();
        await makeApp().serve(port, () => {});

        const ws = new WebSocket(`wss://localhost:${port}/ws/echo`, {
            tls: { rejectUnauthorized: false },
        } as any);
        const reply = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timed out')), 3000);
            ws.onopen = () => ws.send('hi');
            ws.onmessage = (event) => {
                clearTimeout(timer);
                resolve(String(event.data));
            };
            ws.onerror = () => reject(new Error('wss failed'));
        });
        ws.close();
        expect(reply).toBe('echo:hi');
    });

    it('logs an https URL when listening', async () => {
        const log = spyOn(console, 'log').mockImplementation(() => {});
        try {
            const port = freePort();
            await makeApp().serve(port);
            const lines = log.mock.calls.map((c) => String(c[0]));
            expect(lines.some((l) => l.includes(`https://`))).toBe(true);
            expect(lines.some((l) => l.includes(`http://`))).toBe(false);
        } finally {
            log.mockRestore();
        }
    });

    it('warns that fetchHandler() does not use tls', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await makeApp().fetchHandler();
            const lines = warn.mock.calls.map((c) => String(c[0]));
            expect(lines.some((l) => l.includes('tls'))).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });
});
