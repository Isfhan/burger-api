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
    GlobalHooks,
    RequestHandler,
    HTTPMethod,
    BuildConfig,
    MethodSchema,
    OpenAPIMeta,
    RouteConfig,
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

    it('accepts a forward hook returning an after-mapper function', () => {
        // A forward hook may return `(response) => Response` to transform
        // the eventual response once the handler runs — this is real,
        // tested runtime behavior (see `test/lifecycle/jit.test.ts`'s
        // after-mapper tests), distinct from the `transform` hook point
        // (which injects context values, not response mappers).
        const ok: RouteHooks = {
            beforeRoute: [(ctx) => {
                void ctx;
                return (res: Response) => res;
            }],
        };
        expect(ok).toBeDefined();
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

describe('ctx.validated definedness follows the schema generic', () => {
    it('is non-undefined when the handler carries a schema type', () => {
        // Handlers run after validation: with a schema, ctx.validated is
        // set, so direct access compiles without optional chaining.
        const read = (
            c: BurgerContext<{ query: z.ZodObject<{ q: z.ZodString }> }>
        ) => {
            const q: string | undefined = c.validated.query.q;
            return q;
        };
        expect(typeof read).toBe('function');
    });

    it('stays possibly-undefined on a plain BurgerContext', () => {
        const read = (c: BurgerContext) => {
            // @ts-expect-error no schema generic → possibly undefined
            const q = c.validated.query;
            return q;
        };
        expect(typeof read).toBe('function');
    });

    it('rejects access to a slot that was not declared', () => {
        const read = (
            c: BurgerContext<{ query: z.ZodObject<{ q: z.ZodString }> }>
        ) => {
            // @ts-expect-error validated only carries declared slots
            void c.validated.unknownSlot;
        };
        expect(typeof read).toBe('function');
    });

    it('keeps body optional even when declared (JSON-only gate)', () => {
        const read = (
            c: BurgerContext<{ body: z.ZodObject<{ n: z.ZodNumber }> }>
        ) => {
            // @ts-expect-error body is validated only for JSON requests
            const n: number = c.validated.body.n;
            return n;
        };
        expect(typeof read).toBe('function');
    });
});

describe('consumer convention-file types', () => {
    it('BuildConfig types burger.build.ts and rejects typos', () => {
        const config: BuildConfig = {
            apiDir: './src/api',
            pageDir: './src/pages',
            apiPrefix: '/api',
            pagePrefix: '/',
        };
        expect(config.apiDir).toBe('./src/api');
        const bad = {
            apiDir: './src/api',
            pageDir: './src/pages',
            apiPrefix: '/api',
            pagePrefix: '/',
            // @ts-expect-error apiDri is a typo
            apiDri: './src/api',
        } satisfies BuildConfig;
        expect(bad).toBeDefined();
    });

    it('MethodSchema types one schema.ts method export', () => {
        const GET = {
            query: z.object({ q: z.string().optional() }),
            coerce: true,
            response: { '200': z.object({ ok: z.boolean() }) },
        } satisfies MethodSchema;
        expect(GET.coerce).toBe(true);
    });

    it('OpenAPIMeta types one openapi.ts method export', () => {
        const GET = {
            summary: 'List',
            tags: ['x'],
        } satisfies OpenAPIMeta;
        expect(GET.summary).toBe('List');
    });

    it('RouteConfig is augmentable and ctx.config is typed', () => {
        // Augmented in this program by the provider test (auth/cache/timeout).
        const config = { auth: false } satisfies RouteConfig;
        expect(config.auth).toBe(false);

        const ctx = {} as BurgerContext;
        const auth: boolean | undefined = ctx.config?.auth;
        expect(auth).toBeUndefined();
        // @ts-expect-error unknown keys still fail under the augmentation
        const bogus = ctx.config?.nope;
        expect(bogus).toBeUndefined();
    });
});

describe('onRequest is app/plugin scope only, never route scope', () => {
    it('rejects onRequest on a route-level hooks object (always a no-op there)', () => {
        const hooks: RouteHooks = {
            beforeRoute: [() => undefined],
            // @ts-expect-error onRequest is pre-routing — a route can't be
            // matched yet, so it's not part of route-scoped RouteHooks.
            onRequest: [() => undefined],
        };
        expect(hooks).toBeDefined();
    });

    it('accepts onRequest on GlobalHooks (app hooks.ts / plugin hooks)', () => {
        const hooks: GlobalHooks = {
            onRequest: [() => undefined],
            beforeRoute: [() => undefined],
        };
        expect(hooks.onRequest).toBeDefined();
    });
});
