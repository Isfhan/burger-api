import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import * as v from 'valibot';
import { generateOpenAPIDocument } from '../../src/core/openapi';
import { Burger } from '../../src/index';
import type { RouteDefinition } from '../../src/types/index';
import type { OpenAPIConfig } from '../../src/types/openapi-config';

const baseOptions = {} as never;

function makeRoute(
    overrides: Partial<RouteDefinition> & { path: string; handlers: any }
): RouteDefinition {
    return { schema: {}, openapi: {}, ...overrides } as RouteDefinition;
}

function basicHeader(user: string, pass: string): string {
    const bytes = new TextEncoder().encode(`${user}:${pass}`);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return 'Basic ' + btoa(binary);
}

describe('OpenAPI 3.1 document', () => {
    it('declares openapi 3.1.0', () => {
        const doc = generateOpenAPIDocument([], baseOptions);
        expect(doc.openapi).toBe('3.1.0');
    });

    it('requestBody.required reflects whether the schema accepts undefined', () => {
        const routes: RouteDefinition[] = [
            makeRoute({
                path: '/api/required',
                handlers: { POST: () => Response.json({}) },
                schema: {
                    post: { body: z.object({ name: z.string() }) },
                } as never,
            }),
            makeRoute({
                path: '/api/optional',
                handlers: { POST: () => Response.json({}) },
                schema: {
                    post: {
                        body: z.object({ name: z.string() }).optional(),
                    },
                } as never,
            }),
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        expect(
            (doc.paths['/api/required'] as any).post.requestBody.required
        ).toBe(true);
        expect(
            (doc.paths['/api/optional'] as any).post.requestBody.required
        ).toBe(false);
    });

    it('documents wildcard routes as a {wildcard} path param', () => {
        const routes: RouteDefinition[] = [
            makeRoute({
                path: '/api/files/*',
                isWildcard: true,
                handlers: { GET: () => Response.json({}) },
            }),
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        expect(doc.paths['/api/files/{wildcard}']).toBeDefined();
        const getOp = (doc.paths['/api/files/{wildcard}'] as any).get;
        const wildcard = getOp.parameters.find(
            (p: any) => p.in === 'path' && p.name === 'wildcard'
        );
        expect(wildcard).toBeDefined();
        expect(wildcard.description).toMatch(/wildcard/i);
    });

    it('accepts - and _ in :param names', () => {
        const routes: RouteDefinition[] = [
            makeRoute({
                path: '/api/users/:user-id',
                handlers: { GET: () => Response.json({}) },
            }),
            makeRoute({
                path: '/api/things/:snake_case',
                handlers: { GET: () => Response.json({}) },
            }),
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        expect(doc.paths['/api/users/{user-id}']).toBeDefined();
        expect(doc.paths['/api/things/{snake_case}']).toBeDefined();
    });

    it('emits standard-schema parameters by name with an empty schema', () => {
        const routes: RouteDefinition[] = [
            makeRoute({
                path: '/api/search',
                handlers: { GET: () => Response.json({}) },
                schema: {
                    get: {
                        query: v.object({
                            q: v.optional(v.string()),
                            limit: v.optional(v.number()),
                        }),
                        headers: v.object({ 'x-trace': v.optional(v.string()) }),
                    },
                } as never,
            }),
        ];
        const doc = generateOpenAPIDocument(routes, baseOptions);
        const getOp = (doc.paths['/api/search'] as any).get;
        const q = getOp.parameters.find(
            (p: any) => p.in === 'query' && p.name === 'q'
        );
        expect(q).toBeDefined();
        expect(q.schema).toEqual({});
        const limit = getOp.parameters.find(
            (p: any) => p.in === 'query' && p.name === 'limit'
        );
        expect(limit).toBeDefined();
        const trace = getOp.parameters.find(
            (p: any) => p.in === 'header' && p.name === 'x-trace'
        );
        expect(trace).toBeDefined();
    });

    it('uses a configured converter for standard-schema parameters', () => {
        const routes: RouteDefinition[] = [
            makeRoute({
                path: '/api/search2',
                handlers: { GET: () => Response.json({}) },
                schema: {
                    get: {
                        query: v.object({ q: v.optional(v.string()) }),
                    },
                } as never,
            }),
        ];
        const config: OpenAPIConfig = {
            mapJsonSchema: {
                valibot: () => ({
                    type: 'object',
                    properties: { q: { type: 'string' } },
                    required: [],
                }),
            },
        };
        const doc = generateOpenAPIDocument(routes, baseOptions, config);
        const getOp = (doc.paths['/api/search2'] as any).get;
        const q = getOp.parameters.find(
            (p: any) => p.in === 'query' && p.name === 'q'
        );
        expect(q.schema).toEqual({ type: 'string' });
    });
});

describe('docsAuth with non-Latin1 password', () => {
    it('does not throw and accepts the UTF-8 credentials', async () => {
        const burger = new Burger({
            apiRoutes: [
                {
                    path: '/api/hello',
                    handlers: { GET: () => Response.json({ ok: true }) },
                },
            ],
            openapi: {
                docsAuth: { username: 'admin', password: 'pässwörd' },
            },
        });
        const handler = await burger.fetchHandler();

        const denied = await handler(
            new Request('http://localhost/openapi.json')
        );
        expect(denied.status).toBe(401);

        const ok = await handler(
            new Request('http://localhost/openapi.json', {
                headers: {
                    authorization: basicHeader('admin', 'pässwörd'),
                },
            })
        );
        expect(ok.status).toBe(200);
    });
});
