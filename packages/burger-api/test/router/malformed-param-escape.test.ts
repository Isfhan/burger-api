/**
 * A malformed percent escape in a native `:param` must keep the raw segment,
 * exactly like the fetch path's safe decode (never U+FFFD).
 */
import { describe, it, expect, afterEach } from 'bun:test';
import { Burger } from '../../src/index';
import { freePort } from '../free-port';

const apps: Burger[] = [];

afterEach(() => {
    while (apps.length > 0) apps.pop()!.getServer()?.stop();
});

function makeApp(): Burger {
    const app = new Burger({
        apiRoutes: [
            {
                path: '/api/c/:id',
                handlers: {
                    GET: (ctx) => Response.json({ id: ctx.params.id }),
                },
            },
        ],
    });
    apps.push(app);
    return app;
}

describe('malformed percent escapes in native params', () => {
    it('keeps the raw segment on Bun native routes', async () => {
        const app = makeApp();
        const port = freePort();
        await app.serve(port, () => {});
        const res = await fetch(`http://127.0.0.1:${port}/api/c/%ZZ`);
        expect(await res.json()).toEqual({ id: '%ZZ' });
    });

    it('matches the fetch path for malformed escapes', async () => {
        const handler = await makeApp().fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/c/%ZZ')
        );
        expect(await res.json()).toEqual({ id: '%ZZ' });
    });

    it('still decodes valid escapes', async () => {
        const handler = await makeApp().fetchHandler();
        const res = await handler(
            new Request('http://localhost/api/c/a%20b')
        );
        expect(await res.json()).toEqual({ id: 'a b' });
    });
});
