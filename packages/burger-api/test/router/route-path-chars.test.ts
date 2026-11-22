/**
 * Route paths may use every RFC 3986 path character. Only characters that
 * can never appear in a request path (spaces, control characters, non-ASCII,
 * `%`, `#`, `?`, ...) fail at startup.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';

async function request(path: string, url: string): Promise<Response> {
    const handler = await new Burger({
        apiRoutes: [
            {
                path,
                handlers: { GET: () => new Response('ok') },
            },
        ],
    }).fetchHandler();
    return handler(new Request(`http://localhost${url}`));
}

describe('route path characters', () => {
    for (const path of ['/api/users/@me', '/api/a+b', '/api/v1,2']) {
        it(`accepts '${path}'`, async () => {
            const res = await request(path, path);
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('ok');
        });
    }

    for (const [path, segment] of [
        ['/api/a b', 'a b'],
        ['/api/café', 'café'],
    ] as const) {
        it(`rejects '${path}' at startup`, async () => {
            await expect(request(path, path)).rejects.toThrow(
                `Unusable route path segment '${segment}' in '${path}': use only letters, digits and - . _ ~ ! $ & ' ( ) * + , ; = : @ (spaces and non-ASCII characters can never match a request).`
            );
        });
    }
});
