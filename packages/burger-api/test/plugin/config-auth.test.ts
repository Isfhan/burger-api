/**
 * D4 — `config.auth === false` bypass tests for the ecosystem auth plugins.
 *
 * Auth lives in `ecosystem/plugins/` only (1.0). Each plugin must respect
 * `config.auth === false` / `config.auth.required === false` (route-level
 * opt-out from `config.ts`) and 401 otherwise.
 */
import { describe, it, expect } from 'bun:test';
import { Burger } from '../../src/index';
import { apiKey } from '../../../../ecosystem/plugins/api-key/api-key';
import { basicAuth } from '../../../../ecosystem/plugins/basic-auth/basic-auth';
import { jwtAuth } from '../../../../ecosystem/plugins/jwt-auth/jwt-auth';
import { session } from '../../../../ecosystem/plugins/session/session';
import type { Plugin } from '../../src/plugin/types';

async function run(plugin: Plugin, path: string, init?: RequestInit): Promise<Response> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api/guarded',
                handlers: { GET: () => Response.json({ ok: true }) },
                openapi: {},
            },
            {
                path: '/api/open',
                handlers: { GET: () => Response.json({ ok: true }) },
                config: { auth: false },
                openapi: {},
            },
            {
                path: '/api/relaxed',
                handlers: { GET: () => Response.json({ ok: true }) },
                config: { auth: { required: false } },
                openapi: {},
            },
        ],
    });
    burger.usePlugin(plugin);
    const handler = await burger.fetchHandler();
    return handler(new Request(`http://localhost${path}`, init));
}

describe('config.auth === false bypass (ecosystem auth plugins)', () => {
    it('api-key: 401 without key, 200 when auth: false or required: false', async () => {
        const plugin = apiKey({ keys: ['test-key'] });
        expect((await run(plugin, '/api/guarded')).status).toBe(401);
        expect((await run(plugin, '/api/open')).status).toBe(200);
        expect((await run(plugin, '/api/relaxed')).status).toBe(200);
        expect(
            (
                await run(plugin, '/api/guarded', {
                    headers: { 'X-API-Key': 'test-key' },
                })
            ).status
        ).toBe(200);
    });

    it('basic-auth: 401 without credentials, 200 when auth disabled', async () => {
        const plugin = basicAuth({
            validate: async (username, password) =>
                username === 'admin' && password === 'secret'
                    ? { id: '1', username: 'admin' }
                    : null,
        });
        expect((await run(plugin, '/api/guarded')).status).toBe(401);
        expect((await run(plugin, '/api/open')).status).toBe(200);
        expect((await run(plugin, '/api/relaxed')).status).toBe(200);
        expect(
            (
                await run(plugin, '/api/guarded', {
                    headers: {
                        Authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}`,
                    },
                })
            ).status
        ).toBe(200);
    });

    it('jwt-auth: 401 without token, 200 when auth disabled', async () => {
        const plugin = jwtAuth({ secret: 'test-secret-0123456789abcdef0123456789abcdef' });
        expect((await run(plugin, '/api/guarded')).status).toBe(401);
        expect((await run(plugin, '/api/open')).status).toBe(200);
        expect((await run(plugin, '/api/relaxed')).status).toBe(200);
    });

    it('session: 401 without session, 200 when auth disabled', async () => {
        const plugin = session();
        expect((await run(plugin, '/api/guarded')).status).toBe(401);
        expect((await run(plugin, '/api/open')).status).toBe(200);
        expect((await run(plugin, '/api/relaxed')).status).toBe(200);
    });
});
