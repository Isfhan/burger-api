/**
 * Auth plugins run in `transform`, after routing but before validation and
 * body parsing: missing credentials must yield 401 rather than exposing the
 * schema (422) or parsing a malformed body (400).
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { z } from 'zod';
import { Burger } from '../../src/index';
import { jwtAuth, signJwt } from '../../../../ecosystem/plugins/jwt-auth/jwt-auth';
import { apiKey } from '../../../../ecosystem/plugins/api-key/api-key';
import type { Plugin } from '../../src/plugin/types';

const SECRET = 'auth-before-validation-secret-0123456789abcdef';
const API_KEY = 'auth-before-validation-key';
const VALID_ID = '00000000-0000-4000-8000-000000000000';
const VALID_BODY = JSON.stringify({ sku: 'a', qty: 1 });
const INVALID_BODY = JSON.stringify({ sku: 'a', qty: 'many' });

type Run = (path: string, init?: RequestInit) => Promise<Response>;

async function app(plugin: Plugin): Promise<Run> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api/items/:id',
                handlers: { POST: () => Response.json({ ok: true }) },
                schema: {
                    post: {
                        params: z.object({ id: z.string().min(10) }),
                        query: z.object({ q: z.string().min(3) }),
                        headers: z.object({ 'x-required': z.string() }),
                        body: z.object({ sku: z.string(), qty: z.number() }),
                    },
                },
                openapi: {},
            },
            {
                path: '/api/open',
                handlers: { POST: () => Response.json({ ok: true }) },
                schema: {
                    post: { body: z.object({ sku: z.string(), qty: z.number() }) },
                },
                config: { auth: false },
                openapi: {},
            },
        ],
    });
    burger.usePlugin(plugin);
    const handler = await burger.fetchHandler();
    return (path, init) => handler(new Request(`http://localhost${path}`, init));
}

interface PostOptions {
    auth?: Record<string, string>;
    body?: string;
    omitRequiredHeader?: boolean;
}

function post(
    run: Run,
    path: string,
    options: PostOptions = {}
): Promise<Response> {
    const headers: Record<string, string> = {
        'content-type': 'application/json',
    };
    if (!options.omitRequiredHeader) headers['X-Required'] = 'yes';
    Object.assign(headers, options.auth);

    return run(path, {
        method: 'POST',
        headers,
        body: options.body ?? VALID_BODY,
    });
}

const guarded = (query = '?q=abc') => `/api/items/${VALID_ID}${query}`;

interface AuthCase {
    label: string;
    plugin: Plugin;
    auth: () => Promise<Record<string, string>>;
}

const authCases: AuthCase[] = [
    {
        label: 'jwt-auth',
        plugin: jwtAuth({ secret: SECRET }),
        auth: async () => ({
            Authorization: `Bearer ${await signJwt(
                { sub: 'user-1' },
                { secret: SECRET, expiresIn: 60 }
            )}`,
        }),
    },
    {
        label: 'api-key',
        plugin: apiKey({ keys: [API_KEY] }),
        auth: async () => ({ 'X-API-Key': API_KEY }),
    },
];

describe.each(authCases)('$label authenticates before validation', ({ plugin, auth }) => {
    let run: Run;
    let credentials: Record<string, string>;

    beforeAll(async () => {
        run = await app(plugin);
        credentials = await auth();
    });

    it('401 with no credentials and an invalid body (not 422)', async () => {
        const res = await post(run, guarded(), { body: INVALID_BODY });
        expect(res.status).toBe(401);
    });

    it('401 with no credentials and malformed JSON (not 400)', async () => {
        const res = await post(run, guarded(), { body: '{oops' });
        expect(res.status).toBe(401);
    });

    it('401 with no credentials and an invalid query', async () => {
        const res = await post(run, guarded('?q=ab'));
        expect(res.status).toBe(401);
    });

    it('401 with no credentials and invalid params', async () => {
        const res = await post(run, '/api/items/bad');
        expect(res.status).toBe(401);
    });

    it('401 with no credentials and a missing required header', async () => {
        const res = await post(run, guarded(), { omitRequiredHeader: true });
        expect(res.status).toBe(401);
    });

    it('422 with valid credentials and an invalid body', async () => {
        const res = await post(run, guarded(), {
            auth: credentials,
            body: INVALID_BODY,
        });
        expect(res.status).toBe(422);
    });

    it('200 with valid credentials and a valid body', async () => {
        const res = await post(run, guarded(), { auth: credentials });
        expect(res.status).toBe(200);
    });

    it('422 on an auth-disabled route with an invalid body', async () => {
        const res = await post(run, '/api/open', { body: INVALID_BODY });
        expect(res.status).toBe(422);
    });
});
