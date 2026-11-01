/**
 * Response validation is resolved at compile time: 'off' and dev-without-debug
 * drop the validator from the plan, so no body clone/parse happens. 'enforce'
 * (and dev with debug) still validate.
 */
import { describe, it, expect, spyOn } from 'bun:test';
import { z } from 'zod';
import { Burger } from '../../src/index';

async function fetchWith(
    mode: 'off' | 'dev' | 'enforce',
    debug: boolean
): Promise<Response> {
    const burger = new Burger({
        debug,
        validation: { responseValidation: mode },
        apiRoutes: [
            {
                path: '/api/r',
                handlers: { GET: () => Response.json({ id: 123 }) },
                schema: {
                    get: { response: { 200: z.object({ id: z.string() }) } },
                } as never,
                openapi: {},
            },
        ],
    });
    const handler = await burger.fetchHandler();
    return handler(new Request('http://localhost/api/r'));
}

describe('response validation compile-time skip', () => {
    it('off: never clones or parses the response body', async () => {
        const clone = spyOn(Response.prototype, 'clone');
        try {
            const res = await fetchWith('off', false);
            expect(res.status).toBe(200);
            expect(clone).not.toHaveBeenCalled();
        } finally {
            clone.mockRestore();
        }
    });

    it('dev without debug: never clones or parses the response body', async () => {
        const clone = spyOn(Response.prototype, 'clone');
        try {
            const res = await fetchWith('dev', false);
            expect(res.status).toBe(200);
            expect(clone).not.toHaveBeenCalled();
        } finally {
            clone.mockRestore();
        }
    });

    it('dev with debug: still validates (observes)', async () => {
        const clone = spyOn(Response.prototype, 'clone');
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const res = await fetchWith('dev', true);
            expect(res.status).toBe(200);
            expect(clone).toHaveBeenCalled();
        } finally {
            clone.mockRestore();
            warn.mockRestore();
        }
    });

    it('enforce: still validates and rejects a mismatched body', async () => {
        const clone = spyOn(Response.prototype, 'clone');
        const error = spyOn(console, 'error').mockImplementation(() => {});
        try {
            const res = await fetchWith('enforce', false);
            expect(clone).toHaveBeenCalled();
            expect(res.status).toBe(500);
        } finally {
            clone.mockRestore();
            error.mockRestore();
        }
    });
});
