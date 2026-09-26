/**
 * B4 — validation fast-path behavior parity:
 * media-type parsing (case, parameters, `+json`), the blank content-type
 * error, the headers slot (Bun `Headers.toJSON()` path) and the cookies slot
 * reusing `ctx.cookies`.
 */
import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { Router } from '../../src/router/router';
import type { RouteDefinition } from '../../src/types/index';

function bodyRouter() {
    const defs = [
        {
            path: '/api/b',
            handlers: {
                POST: (ctx: import('../../src/context/context').BurgerContext) =>
                    Response.json(ctx.validated),
            },
            schema: { post: { body: z.object({ name: z.string() }) } },
        } as unknown as RouteDefinition,
    ];
    const router = new Router();
    router.compile(defs);
    return (type: string | null, body = '{"name":"a"}') =>
        router.fetch(
            new Request('http://t/api/b', {
                method: 'POST',
                headers:
                    type === null ? undefined : { 'content-type': type },
                body,
            })
        );
}

describe('B4 — body media-type gate', () => {
    it('accepts application/json with parameters', async () => {
        const post = bodyRouter();
        const res = await post('application/json; charset=utf-8');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ body: { name: 'a' } });
    });

    it('accepts mixed-case Application/JSON', async () => {
        const post = bodyRouter();
        const res = await post('Application/JSON');
        expect(res.status).toBe(200);
    });

    it('accepts +json media types', async () => {
        const post = bodyRouter();
        const res = await post('application/vnd.api+json');
        expect(res.status).toBe(200);
    });

    it('rejects non-JSON with 415 (media type in the detail)', async () => {
        const post = bodyRouter();
        const res = await post('text/plain');
        expect(res.status).toBe(415);
        expect((await res.json()) as { detail: string }).toMatchObject({
            detail: expect.stringContaining('"text/plain"'),
        });
    });

    it('rejects a missing content-type with a 422 body error', async () => {
        const post = bodyRouter();
        const res = await post(null);
        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            errors: { body: Array<{ message: string }> };
        };
        expect(body.errors.body[0]!.message).toBe(
            'Content-Type header required for body validation'
        );
    });
});

describe('B4 — headers and cookies slots', () => {
    it('validates headers from mixed-case names via Headers.toJSON()', async () => {
        const defs = [
            {
                path: '/api/h',
                handlers: {
                    GET: (ctx: import('../../src/context/context').BurgerContext) =>
                        Response.json(ctx.validated),
                },
                schema: {
                    get: { headers: z.object({ 'x-api-key': z.string() }) },
                },
            } as unknown as RouteDefinition,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(
            new Request('http://t/api/h', {
                headers: { 'X-Api-Key': 'abc' },
            })
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ headers: { 'x-api-key': 'abc' } });
    });

    it('validates cookies through the cached ctx.cookies record', async () => {
        const defs = [
            {
                path: '/api/c',
                handlers: {
                    GET: (ctx: import('../../src/context/context').BurgerContext) =>
                        Response.json(ctx.validated),
                },
                schema: { get: { cookies: z.object({ sid: z.string() }) } },
            } as unknown as RouteDefinition,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(
            new Request('http://t/api/c', {
                headers: { cookie: 'sid=xyz' },
            })
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ cookies: { sid: 'xyz' } });
    });

    it('error bodies still group issues by slot (params + query)', async () => {
        const defs = [
            {
                path: '/api/e/:id',
                handlers: {
                    GET: (ctx: import('../../src/context/context').BurgerContext) =>
                        Response.json(ctx.validated),
                },
                schema: {
                    get: {
                        params: z.object({ id: z.number() }),
                        query: z.object({ n: z.number() }),
                    },
                },
            } as unknown as RouteDefinition,
        ];
        const router = new Router();
        router.compile(defs);
        const res = await router.fetch(
            new Request('http://t/api/e/abc?n=xyz')
        );
        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            errors: Record<string, unknown[]>;
        };
        expect(Object.keys(body.errors)).toEqual(['params', 'query']);
    });
});
