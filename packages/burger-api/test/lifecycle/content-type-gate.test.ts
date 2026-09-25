/**
 * Body validation content-type gate: media-type parsing, casing tolerance,
 * missing-header rejection, 415 for non-JSON bodies.
 */
import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { Burger } from '../../src/index';

const schema = { post: { body: z.object({ name: z.string() }) } };

async function postBody(
    body: string,
    headers: Record<string, string> = {}
): Promise<Response> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api',
                handlers: { POST: () => Response.json({ ok: true }) },
                schema: schema as never,
                openapi: {},
            },
        ],
    });
    const handler = await burger.fetchHandler();
    return handler(
        new Request('http://localhost/api', {
            method: 'POST',
            headers,
            body,
        })
    );
}

describe('body validation content-type gate', () => {
    it('validates a body with a mixed-case media type', async () => {
        const bad = await postBody('{"name": 123}', { 'Content-Type': 'Application/JSON' });
        expect(bad.status).toBe(422);
        const ok = await postBody('{"name": "alice"}', { 'Content-Type': 'Application/JSON' });
        expect(ok.status).toBe(200);
    });

    it('validates a body with parameters on the media type', async () => {
        const bad = await postBody('{"name": 123}', {
            'Content-Type': 'application/json; charset=utf-8',
        });
        expect(bad.status).toBe(422);
        const ok = await postBody('{"name": "alice"}', {
            'Content-Type': 'application/json; charset=utf-8',
        });
        expect(ok.status).toBe(200);
    });

    it('rejects a body-required schema with no Content-Type', async () => {
        const res = await postBody('{"name": "alice"}');
        expect(res.status).toBe(422);
    });

    it('rejects non-JSON media types with 415 (never skips validation)', async () => {
        for (const type of ['application/x-www-form-urlencoded', 'text/plain']) {
            const res = await postBody('name=alice', { 'Content-Type': type });
            expect(res.status).toBe(415);
            expect(res.headers.get('content-type')).toBe(
                'application/problem+json'
            );
            const data = (await res.json()) as { title: string };
            expect(data.title).toBe('Unsupported Media Type');
        }
    });

    it('accepts structured-syntax JSON media types (application/*+json)', async () => {
        const ok = await postBody('{"name": "alice"}', {
            'Content-Type': 'application/merge-patch+json',
        });
        expect(ok.status).toBe(200);
    });
});