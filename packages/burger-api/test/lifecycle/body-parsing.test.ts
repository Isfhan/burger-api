/**
 * Body parsing: malformed JSON is a 400 (with or without a body schema), the
 * raw body stays readable after validation, and an empty body validates as
 * `undefined` for optional schemas.
 */
import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { Burger } from '../../src/index';
import type { BurgerContext } from '../../src/context/context';

async function post(
    burger: Burger,
    body?: string,
    headers: Record<string, string> = { 'content-type': 'application/json' }
): Promise<Response> {
    const handler = await burger.fetchHandler();
    return handler(
        new Request('http://localhost/api/b', {
            method: 'POST',
            headers,
            body,
        })
    );
}

function app(
    handler: (ctx: BurgerContext) => Response | Promise<Response>,
    bodySchema?: z.ZodType
): Burger {
    return new Burger({
        apiRoutes: [
            {
                path: '/api/b',
                handlers: { POST: handler },
                schema: bodySchema
                    ? ({ post: { body: bodySchema } } as never)
                    : undefined,
                openapi: {},
            },
        ],
    });
}

describe('malformed JSON', () => {
    it('is a 400 when a body schema is declared', async () => {
        const res = await post(
            app(
                () => Response.json({ ok: true }),
                z.object({ name: z.string() })
            ),
            '{bad'
        );
        expect(res.status).toBe(400);
        expect(res.headers.get('content-type')).toBe(
            'application/problem+json'
        );
        const body = (await res.json()) as { title: string };
        expect(body.title).toBe('Bad Request');
    });

    it('is a 400 without a body schema', async () => {
        const res = await post(
            app(async (ctx) => Response.json(await ctx.json())),
            '{bad'
        );
        expect(res.status).toBe(400);
    });
});

describe('raw body stays readable after validation', () => {
    const schema = z.object({ name: z.string() });

    it('ctx.text() returns the exact request body', async () => {
        const raw = '{"name":"alice"}';
        const res = await post(
            app(async (ctx) => Response.json({ text: await ctx.text() }), schema),
            raw
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ text: raw });
    });

    it('ctx.arrayBuffer() returns the request body bytes', async () => {
        const raw = '{"name":"alice"}';
        const res = await post(
            app(async (ctx) => {
                const bytes = new Uint8Array(await ctx.arrayBuffer());
                return Response.json({
                    text: new TextDecoder().decode(bytes),
                });
            }, schema),
            raw
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ text: raw });
    });

    it('ctx.json() still works after validation', async () => {
        const res = await post(
            app(async (ctx) => Response.json(await ctx.json()), schema),
            '{"name":"alice"}'
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ name: 'alice' });
    });
});

describe('empty body with an optional schema', () => {
    const optional = z.object({ name: z.string() }).optional();

    it('validates as undefined with a JSON content type', async () => {
        const res = await post(
            app(
                (ctx) =>
                    Response.json({
                        hasBody:
                            (ctx.validated as { body?: unknown } | undefined)
                                ?.body !== undefined,
                    }),
                optional
            )
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ hasBody: false });
    });

    it('validates as undefined with no content type', async () => {
        const res = await post(
            app(
                (ctx) =>
                    Response.json({
                        hasBody:
                            (ctx.validated as { body?: unknown } | undefined)
                                ?.body !== undefined,
                    }),
                optional
            ),
            undefined,
            {}
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ hasBody: false });
    });
});

describe('raw body access', () => {
    // Webhook signatures are computed over the exact bytes; reading bytes
    // first must not round-trip them through text.
    it('arrayBuffer() first returns the exact bytes, even if not UTF-8', async () => {
        let seen: number[] = [];
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/hook',
                    handlers: {
                        POST: async (ctx: BurgerContext) => {
                            seen = [...new Uint8Array(await ctx.arrayBuffer())];
                            await ctx.text();
                            return new Response('ok');
                        },
                    },
                    openapi: {},
                },
            ],
        });
        const handler = await burger.fetchHandler();
        const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x80]);
        const res = await handler(
            new Request('http://localhost/api/hook', { method: 'POST', body: bytes })
        );

        expect(res.status).toBe(200);
        expect(seen).toEqual([0xff, 0xfe, 0x41, 0x80]);
    });
});
