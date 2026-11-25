/**
 * Placement regression: logger, security-headers and compression return
 * response mappers, so registering them in `onRequest` makes them cover 404,
 * 405, validation (422) and `onError` (500) responses, and log the final
 * status.
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { z } from 'zod';
import { Burger } from '../../src/index';
import { createLogger } from '../../../../ecosystem/hooks/logger/logger';
import { securityHeaders } from '../../../../ecosystem/hooks/security-headers/security-headers';

const logs: string[] = [];
let run: (path: string, init?: RequestInit) => Promise<Response>;

beforeAll(async () => {
    // The logger captures `console.log` when it is created, so override it
    // before `createLogger` and restore it straight after.
    const original = console.log;
    console.log = (...args: unknown[]) => {
        logs.push(args.join(' '));
    };
    const logger = createLogger({ format: 'json', colors: false });
    console.log = original;

    const burger = new Burger({
        globalHooks: { onRequest: [logger, securityHeaders()] },
        apiRoutes: [
            {
                path: '/api/ok',
                handlers: { GET: () => Response.json({ ok: 1 }) },
            },
            {
                path: '/api/val',
                handlers: { POST: () => Response.json({}) },
                schema: { post: { body: z.object({ a: z.string() }) } },
            },
            {
                path: '/api/boom',
                handlers: {
                    GET: () => {
                        throw new Error('boom');
                    },
                },
            },
            {
                path: '/api/enf',
                handlers: { GET: () => Response.json({ id: 'x' }) },
                schema: {
                    get: { response: { 200: z.object({ id: z.number() }) } },
                },
                config: { responseValidation: 'enforce' },
            },
        ],
    });
    const handler = await burger.fetchHandler();
    run = (path, init) =>
        handler(new Request(`http://localhost${path}`, init));
});

async function request(path: string, init?: RequestInit) {
    logs.length = 0;
    const res = await run(path, init);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {
        res,
        statuses: logs.map(
            (line) => (JSON.parse(line) as { status: number }).status
        ),
    };
}

describe('onRequest response hooks cover every response', () => {
    it('covers a 404', async () => {
        const { res, statuses } = await request('/nope');
        expect(res.status).toBe(404);
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(statuses).toEqual([404]);
    });

    it('covers a 405', async () => {
        const { res, statuses } = await request('/api/ok', {
            method: 'DELETE',
        });
        expect(res.status).toBe(405);
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(statuses).toEqual([405]);
    });

    it('covers a 422 validation response', async () => {
        const { res, statuses } = await request('/api/val', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        });
        expect(res.status).toBe(422);
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(statuses).toEqual([422]);
    });

    it('covers an onError 500 response', async () => {
        const { res, statuses } = await request('/api/boom');
        expect(res.status).toBe(500);
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(statuses).toEqual([500]);
    });

    it('logs the final status when enforce validation turns 200 into 500', async () => {
        const { res, statuses } = await request('/api/enf');
        expect(res.status).toBe(500);
        expect(statuses).toEqual([500]);
    });
});
