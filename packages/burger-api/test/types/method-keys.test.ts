/**
 * Type-level tests for the public method-key typing and related type
 * contracts. These tests are compile-time assertions: they pass at runtime
 * trivially, but the `tsc` gate checks the `@ts-expect-error` markers and the
 * `Expect`/`Equal` type assertions.
 */
import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import type { BurgerContext } from '../../src/context/context';
import type {
    RouteDefinition,
    RouteSchema,
    openapi,
    RouteHooks,
    RequestHandler,
    HTTPMethod,
} from '../../src/index';
import type { BurgerWS } from '../../src/ws/types';

const handler: RequestHandler = async () => new Response('ok');

// Self-contained augmentation for the WebSocketData test below.
declare module 'burger-api' {
    interface WebSocketData {
        room?: string;
    }
}

describe('handlers method keys (uppercase only)', () => {
    it('accepts uppercase handler keys', () => {
        const def: RouteDefinition = {
            path: '/x',
            handlers: { GET: handler, POST: handler },
        };
        expect(def.path).toBe('/x');
    });

    it('rejects lowercase handler keys (never dispatch at runtime)', () => {
        const def: RouteDefinition = {
            path: '/x',
            // @ts-expect-error lowercase keys would 405 at runtime
            handlers: { get: handler },
        };
        expect(def).toBeDefined();
    });

    it('rejects unknown methods', () => {
        const def: RouteDefinition = {
            path: '/x',
            // @ts-expect-error PURGE is not a supported HTTP method
            handlers: { PURGE: handler },
        };
        expect(def).toBeDefined();
    });
});

describe('schema method keys (lowercase + uppercase both legal)', () => {
    it('accepts lowercase and uppercase keys', () => {
        const schema: RouteSchema = {
            get: { query: z.object({ q: z.string() }) },
            POST: { body: z.object({ name: z.string() }) },
        };
        expect(schema).toBeDefined();
    });

    it('rejects typo schema keys', () => {
        const schema: RouteSchema = {
            // @ts-expect-error "gett" is not a method name
            gett: { query: z.object({}) },
        };
        expect(schema).toBeDefined();
    });
});

describe('openapi method keys (lowercase only)', () => {
    it('accepts lowercase keys', () => {
        const meta: openapi = { get: { summary: 'List' } };
        expect(meta).toBeDefined();
    });

    it('rejects uppercase keys (silent no-op at runtime)', () => {
        const meta: openapi = {
            // @ts-expect-error uppercase openapi keys are silently ignored
            GET: { summary: 'List' },
        };
        expect(meta).toBeDefined();
    });

    it('types responses as object maps', () => {
        const meta: openapi = {
            get: { responses: { '200': { description: 'ok' } } },
        };
        expect(meta).toBeDefined();
        const bad: openapi = {
            get: {
                // @ts-expect-error a response value must be an object
                responses: { '200': 42 },
            },
        };
        expect(bad).toBeDefined();
    });
});

describe('HTTPMethod union', () => {
    it('is a closed union of the supported methods', () => {
        const m: HTTPMethod = 'GET';
        // @ts-expect-error FOO is not an HTTP method
        const n: HTTPMethod = 'FOO';
        expect([m, n]).toBeDefined();
    });
});

describe('BurgerContext.json<T>', () => {
    it('infers the parsed body when the type argument is given', () => {
        const read: (c: BurgerContext) => Promise<{ id: number }> = async (
            c
        ) => c.json<{ id: number }>();
        expect(typeof read).toBe('function');
    });
});

describe('WebSocketData augmentation', () => {
    it('types ws.data through the augmentation interface', () => {
        const data: BurgerWS['data'] = { room: 'general' };
        expect(data.room).toBe('general');
        // @ts-expect-error undeclared keys are rejected
        const bad: BurgerWS['data'] = { notDeclared: 1 };
        expect(bad).toBeDefined();
    });
});

describe('stage-precise hook contracts', () => {
    it('accepts forward hooks returning Response / undefined / async void', () => {
        const hooks: RouteHooks = {
            beforeRoute: [
                (ctx) => {
                    void ctx;
                    return new Response('x');
                },
                () => undefined,
                async () => {},
            ],
        };
        expect(hooks).toBeDefined();
    });

    it('rejects non-contract returns from forward hooks', () => {
        const bad: RouteHooks = {
            // @ts-expect-error 42 is not a Response / undefined
            beforeRoute: [() => 42],
        };
        expect(bad).toBeDefined();
    });

    it('rejects transform functions on forward stages', () => {
        const bad: RouteHooks = {
            // @ts-expect-error transforms belong on afterRoute / mapResponse
            beforeRoute: [(ctx) => (res) => res],
        };
        expect(bad).toBeDefined();
    });

    it('rejects onError-shaped hooks on forward stages', () => {
        const bad: RouteHooks = {
            // @ts-expect-error (err, ctx) is an ErrorHook, not a ForwardHook
            beforeRoute: [(err, ctx) => new Response('err')],
        };
        expect(bad).toBeDefined();
    });

    it('accepts transform functions on response stages', () => {
        const hooks: RouteHooks = {
            afterRoute: [(ctx) => (res) => res],
            mapResponse: [async () => (res) => res],
        };
        expect(hooks).toBeDefined();
    });

    it('rejects non-contract returns from response hooks', () => {
        const bad: RouteHooks = {
            // @ts-expect-error strings are not part of the response contract
            afterRoute: [() => 'after'],
        };
        expect(bad).toBeDefined();
    });

    it('rejects non-contract returns on the onError stage', () => {
        const bad: RouteHooks = {
            // @ts-expect-error onError returns Response | void | undefined
            onError: [() => 'not-a-response'],
        };
        expect(bad).toBeDefined();
    });

    it('types the response-hook transform function signature', () => {
        const hooks: RouteHooks = {
            afterRoute: [
                // The transform receives the response and returns a response
                // (sync or async); ctx is typed.
                (ctx) => (res) => {
                    void ctx;
                    return new Response(res.body, { status: res.status });
                },
            ],
        };
        expect(hooks).toBeDefined();
    });
});

describe('typed validated slots', () => {
    it('rejects unknown slots on the validated object', () => {
        const read = (c: BurgerContext<{ query: z.ZodObject<{ q: z.ZodString }> }>) => {
            // @ts-expect-error validated only carries declared slots
            void c.validated?.unknownSlot;
        };
        expect(typeof read).toBe('function');
    });
});

describe('RouteDefinition with schema compiles end-to-end', () => {
    it('accepts a full definition with typed handlers and schema', () => {
        const def: RouteDefinition = {
            path: '/users/:id',
            handlers: { GET: handler, POST: handler },
            schema: {
                get: { params: z.object({ id: z.string() }) },
            },
            openapi: { get: { summary: 'User' } },
        };
        expect(def.path).toBe('/users/:id');
    });
});
