/**
 * Response validation wiring: lowercase-method normalization in the real
 * pipeline, enforce vs dev modes, status-class fallback.
 */
import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { Burger } from '../../src/index';

async function fetchRoute(
    routeSchema: unknown,
    handler: () => Response,
    validation: { responseValidation?: 'off' | 'dev' | 'enforce' } = {}
): Promise<Response> {
    const burger = new Burger({
        apiRoutes: [
            {
                path: '/api/items/:id',
                schema: routeSchema as never,
                handlers: { GET: handler },
                openapi: {},
            },
        ],
        validation: validation as never,
    });
    const handlerFn = await burger.fetchHandler();
    return handlerFn(new Request('http://localhost/api/items/7'));
}

describe('response validation (full pipeline)', () => {
    it('enforce: rejects a schema-violating response body', async () => {
        const res = await fetchRoute(
            {
                get: { response: { 200: z.object({ id: z.string() }) } },
            },
            () => Response.json({ id: 123 }),
            { responseValidation: 'enforce' }
        );
        expect(res.status).toBe(500);
    });

    it('enforce: accepts a matching response body', async () => {
        const res = await fetchRoute(
            {
                get: { response: { 200: z.object({ id: z.string() }) } },
            },
            () => Response.json({ id: '7' }),
            { responseValidation: 'enforce' }
        );
        expect(res.status).toBe(200);
    });

    it('dev: logs a violation but passes the response through', async () => {
        const res = await fetchRoute(
            {
                get: { response: { 200: z.object({ id: z.string() }) } },
            },
            () => Response.json({ id: 123 }),
            { responseValidation: 'dev' }
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: 123 });
    });

    it('enforce: status-class (2xx) fallback still applies', async () => {
        const res = await fetchRoute(
            {
                get: { response: { '2xx': z.object({ id: z.string() }) } },
            },
            () => Response.json({ id: 123 }),
            { responseValidation: 'enforce' }
        );
        expect(res.status).toBe(500);
    });
});