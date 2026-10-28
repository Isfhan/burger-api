import { describe, it, expect } from 'bun:test';
import { type } from 'arktype';
import { Burger } from '../../src/index';

// ArkType schemas are callable functions that carry `~standard`.
describe('ArkType (Standard Schema as a function)', () => {
    async function app() {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/people',
                    handlers: {
                        POST: (ctx: any) => Response.json(ctx.validated.body),
                    },
                    schema: {
                        POST: { body: type({ name: 'string', age: 'number' }) },
                    },
                } as never,
            ],
        });
        return burger.fetchHandler();
    }

    const post = (body: unknown) =>
        new Request('http://localhost/api/people', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });

    it('accepts a valid body', async () => {
        const res = await (await app())(post({ name: 'Ada', age: 36 }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ name: 'Ada', age: 36 });
    });

    it('rejects an invalid body with 422', async () => {
        const res = await (await app())(post({ name: 'Ada', age: 'old' }));
        expect(res.status).toBe(422);
    });
});
