import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { generateOpenAPIDocument } from '../../src/core/openapi';
import type { RouteDefinition } from '../../src/types/index';

// Locks the OpenAPI output for common Zod types, so a Zod upgrade that
// changes its JSON Schema output shows up as a snapshot diff.
const Post = z.object({
    id: z.uuid(),
    title: z.string().min(1).max(120),
    body: z.string().optional(),
    email: z.email(),
    url: z.url().nullable(),
    publishedAt: z.iso.datetime(),
    day: z.iso.date(),
    views: z.number().int().nonnegative(),
    rating: z.number().min(0).max(5).default(0),
    status: z.enum(['draft', 'published']),
    kind: z.literal('post'),
    tags: z.array(z.string()).max(10),
    meta: z.record(z.string(), z.unknown()),
    author: z.union([
        z.object({ type: z.literal('user'), id: z.string() }),
        z.object({ type: z.literal('bot'), name: z.string() }),
    ]),
    flags: z.tuple([z.boolean(), z.number()]),
});

const routes: RouteDefinition[] = [
    {
        path: '/api/posts/:id',
        handlers: {
            GET: () => Response.json({}),
            PUT: () => Response.json({}),
        },
        schema: {
            get: {
                params: z.object({ id: z.uuid() }),
                query: z.object({
                    page: z.coerce.number().int().min(1).default(1),
                    q: z.string().optional(),
                }),
                response: Post,
            },
            put: {
                params: z.object({ id: z.uuid() }),
                body: Post.omit({ id: true }).partial(),
                response: Post,
            },
        },
        openapi: {},
    } as never,
];

describe('OpenAPI output snapshot (Zod)', () => {
    it('stays stable', () => {
        const doc = generateOpenAPIDocument(routes, {} as never);
        expect(doc.paths).toMatchSnapshot();
    });
});
