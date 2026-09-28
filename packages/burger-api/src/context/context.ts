import type {
    ContextInit,
    ContextSet,
    RouteAccessInfo,
    RouteMeta,
} from './types.js';
import { parseQuery } from './query-parser.js';
import { parseCookies } from '../validation/validator.js';
import { TrackedContextSet } from './context-set.js';
import { extractPathnameFromUrl } from '../utils/wildcard.js';
import type { InferValidated } from '../types/inference.js';
import type { RouteMethodSchema } from '../types/inference.js';
import type { RouteConfig } from '../types/index.js';
import { HTTPError } from '../errors/http-error.js';

/**
 * Module augmentation target for `ctx.services`:
 *
 * ```ts
 * declare module "burger-api" {
 * interface BurgerServices {
 * db: Database;
 * logger: Logger;
 * }
 * }
 * ```
 */
export interface BurgerServices {}

/**
 * Module augmentation target for `ctx.validated`. Default slots match the
 * validator: `params`, `query`, `body`, `headers`, `cookies`.
 *
 * `BurgerContext<typeof GET>` types it from `schema.ts` automatically;
 * augmentation is the escape hatch for anything inference cannot express:
 *
 * ```ts
 * declare module "burger-api" {
 * interface BurgerValidated {
 * body: { name: string };
 * }
 * }
 * ```
 */
export interface BurgerValidated {
    params?: unknown;
    query?: unknown;
    body?: unknown;
    headers?: unknown;
    cookies?: unknown;
}

/**
 * Module augmentation target for deployment-platform bindings (`ctx.env`).
 * `toFetchHandler(burger)` on WinterCG targets receives the platform `env`;
 * plain Bun `serve()` leaves it `undefined`:
 *
 * ```ts
 * declare module "burger-api" {
 * interface BurgerEnv {
 * MY_DB: D1Database;
 * SECRETS: { apiKey: string };
 * }
 * }
 * ```
 */
export interface BurgerEnv {}

/**
 * Minimal view of a platform execution context (third argument of a WinterCG
 * `fetch(request, env, ctx)` handler). Only `waitUntil` is modeled.
 */
export interface BurgerExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
}

/** A server handle that can report a request's peer address (Bun's `Server`). */
export interface RequestIPSource {
    requestIP(request: Request): { address: string } | null | undefined;
}

/**
 * Per-app mutable reference to the serving runtime's IP source. The adapter
 * writes the server once at startup (stable for the life of the server), so
 * `ctx.ip` resolves lazily with no per-request bookkeeping.
 */
export interface RequestIPHolder {
    server?: RequestIPSource;
}

/**
 * Shared services object for apps without `burger.provide()` providers.
 * Frozen: services are app-scoped singletons, never per-request scratch space.
 */
export const EMPTY_SERVICES = Object.freeze(
    Object.create(null) as BurgerServices
) as BurgerServices;

/**
 * Resolves the app-level services for `ctx.services` once, at compile time.
 * Providers are app-scoped singletons, so the resulting frozen bag is shared
 * by every request; a prebuilt object passes through unchanged.
 */
export function createServices(
    providers?: Map<string, unknown> | BurgerServices
): BurgerServices {
    if (providers === undefined) return EMPTY_SERVICES;
    if (providers instanceof Map) {
        if (providers.size === 0) return EMPTY_SERVICES;
        return Object.freeze(
            Object.fromEntries(providers)
        ) as unknown as BurgerServices;
    }
    return providers;
}

/**
 * Per-request client address sources keyed by the raw `Request`. Set by the
 * serving layer (or a Node adapter via {@link setRequestIP}); read by `ctx.ip`.
 */
const requestIPs = new WeakMap<Request, string | RequestIPSource>();

/**
 * Records the client (socket peer) address for a request so `ctx.ip` can
 * report it. Pass the address string (e.g. a Node adapter's
 * `socket.remoteAddress`) or a server with `requestIP(request)` (Bun),
 * resolved lazily on first read. Adapter-facing; apps read `ctx.ip`.
 */
export function setRequestIP(
    request: Request,
    source: string | RequestIPSource
): void {
    requestIPs.set(request, source);
}

/** True when `value` looks like a server that can resolve peer addresses. */
export function isRequestIPSource(value: unknown): value is RequestIPSource {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as RequestIPSource).requestIP === 'function'
    );
}

/**
 * Module augmentation target for custom properties on BurgerContext, e.g.
 * request-scoped values set in `transform` hooks:
 *
 * ```ts
 * declare module "burger-api" {
 * interface BurgerContext {
 * user: User;
 * session: Session;
 * tenant: Tenant;
 * }
 * }
 * ```
 *
 * The class is defined below; this interface exists for declaration merging.
 */
export interface BurgerContext {}

/**
 * `BurgerContext` — the public request context type.
 *
 * Exactly one instance is allocated per request via `BurgerContext.create()`;
 * it is re-bound to the matched route, never re-allocated.
 *
 * Generic over the route's `schema.ts` method export for `ctx.validated`
 * inference:
 *
 * ```ts
 * // schema.ts
 * export const GET = { query: z.object({ q: z.string() }) };
 *
 * // route.ts
 * import type { GET as RouteSchema } from './schema';
 * export async function GET(ctx: BurgerContext<typeof RouteSchema>) {
 *     ctx.validated.query; // { q: string } | undefined
 * }
 * ```
 *
 * The default type parameter keeps plain `BurgerContext` working (slots fall
 * back to `unknown`, `BurgerValidated` augmentation applies).
 *
 * One shared frozen prototype carries every lazy getter and delegated
 * `Request` member; instances hold only mutable state, so every instance has
 * the same shape. Fields are parsed lazily and at most once — a field a route
 * never reads is never parsed.
 */
export class BurgerContext<TRoute = unknown> {
    /**
     * The underlying `Request`; the standard `Request` surface delegates to
     * it. Never copied.
     *
     * `declare` (never `!`) keeps the field type-only: a class-field
     * initializer would re-define it on every `new BurgerContext()` and
     * duplicate the assignments `create()` performs in declaration order.
     */
    declare private _raw: Request;

    /**
     * Route-specific data seeded at creation. Exposed via the `params` /
     * `wildcardParams` / `route` getters.
     */
    declare private _ctxInit: ContextInit;

    /** Cached parsed query (lazy). `undefined` until first access. */
    declare private _query: Record<string, string | string[]> | undefined;

    /** Cached parsed cookies (lazy). `undefined` until first access. */
    declare private _cookies: Record<string, string> | undefined;

    /**
     * Cached `json()` result. `undefined` until the body is parsed. Lets
     * `ctx.json()` be called again after validation read the stream.
     */
    declare private _json: Promise<unknown> | undefined;

    /**
     * Validated data attached by the validation hook. Starts `undefined` so
     * the hook runs (it short-circuits when already truthy).
     *
     * Typed from `schema.ts` via `BurgerContext<typeof GET>`, falling back to
     * `BurgerValidated`. When the route declares a schema the type is
     * non-undefined: a failed validation throws 422 and the handler never
     * runs. A plain `BurgerContext` keeps `| undefined` (no schema, no hook).
     */
    declare validated: TRoute extends RouteMethodSchema
        ? InferValidated<TRoute> & BurgerValidated
        : (InferValidated<TRoute> & BurgerValidated) | undefined;

    /**
     * The response-mutation object exposed through `ctx.set`. Allocated
     * lazily on first access (most requests never mutate the response) and
     * merged into the response by `applySet` at the pipeline exit. `cookies`
     * is reserved for a future release.
     */
    declare private _set: ContextSet | undefined;

    /** True once anything touched `ctx.set` (lazy allocation marker). */
    hasSet(): boolean {
        return this._set !== undefined;
    }

    get set(): ContextSet {
        return (this._set ??= new TrackedContextSet());
    }

    set set(value: ContextSet) {
        this._set = value;
    }

    /**
     * Injected application services from `burger.provide()`, typed via
     * augmentation of `BurgerServices`. Assigned once in `create()`: one
     * frozen, shared object — never a per-request copy.
     */
    declare services: BurgerServices;

    /**
     * Route-specific configuration from `config.ts`, read-only at runtime.
     * Typed via augmentation of `RouteConfig`.
     */
    declare private _config: RouteConfig | undefined;

    /**
     * Deployment-platform bindings (`env.MY_KV`, secrets, …), populated by the
     * serving entry point; `undefined` on runtimes without bindings.
     */
    declare private _env: BurgerEnv | undefined;

    /**
     * Platform execution context (`waitUntil` and friends). Same lifecycle
     * as `_env`: provided by the entry point, carried across re-binding.
     */
    declare private _executionCtx: BurgerExecutionContext | undefined;

    /**
     * Per-app server reference for resolving `ctx.ip` lazily. `undefined` on
     * runtimes without a socket server (WinterCG).
     */
    declare private _ipHolder: RequestIPHolder | undefined;

    /**
     * Cached `ctx.ip` result. `null` records "resolved to undefined" so the
     * runtime is queried at most once per request.
     */
    declare private _ip: string | null | undefined;

    /**
     * The single context creation entry point.
     *
     * `meta` (a `RouteAccessInfo` hint) is accepted but ignored at runtime:
     * every field is already available lazily on the stable prototype.
     */
    static create(
        raw: Request,
        ctxInit?: ContextInit,
        _meta?: RouteAccessInfo,
        services?: Map<string, unknown> | BurgerServices,
        config?: RouteConfig | Record<string, unknown>,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext,
        ipHolder?: RequestIPHolder
    ): BurgerContext {
        const ctx = new BurgerContext();
        // Assignments run in declaration order so every instance has an
        // identical hidden class.
        ctx._raw = raw;
        ctx._ctxInit = ctxInit ?? {};
        ctx._query = undefined;
        ctx._cookies = undefined;
        ctx._json = undefined;
        ctx.validated = undefined;
        ctx._set = undefined;
        // A Map (direct callers, e.g. the WS adapter) is copied per context;
        // a prebuilt services object (the compiled route path) is shared.
        ctx.services =
            services === undefined
                ? EMPTY_SERVICES
                : services instanceof Map
                  ? (Object.fromEntries(services) as unknown as BurgerServices)
                  : (services as BurgerServices);
        // Route config is opaque user data until `RouteConfig` is augmented.
        ctx._config = config as RouteConfig;
        ctx._env = env ?? undefined;
        ctx._executionCtx = executionCtx ?? undefined;
        ctx._ipHolder = ipHolder;
        ctx._ip = undefined;
        return ctx;
    }

    /**
     * @internal Re-bind route-specific state on an existing context.
     *
     * The router creates one context per request before routing (so
     * `onRequest` hooks can seed request IDs, counters, …) and the dispatched
     * handler binds that same instance to the matched route. Caches stay
     * valid because the underlying `Request` is identical.
     */
    bind(
        raw: Request,
        ctxInit?: ContextInit,
        _meta?: RouteAccessInfo,
        _services?: Map<string, unknown> | BurgerServices,
        config?: RouteConfig | Record<string, unknown>,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext,
        ipHolder?: RequestIPHolder
    ): this {
        // `raw` is always the request the context was created for; reset the
        // lazily cached peer address only if that ever stops holding.
        if (raw !== this._raw) {
            this._ip = undefined;
        }
        this._raw = raw;
        this._ctxInit = ctxInit ?? this._ctxInit;
        // Services were resolved at creation (shared per app); bind must not
        // rebuild them per request.
        if (config !== undefined) {
            this._config = config as RouteConfig;
        }
        // Platform bindings carry over from the pre-routing context unless a
        // fresh value is supplied.
        if (env !== undefined) {
            this._env = env;
        }
        if (executionCtx !== undefined) {
            this._executionCtx = executionCtx;
        }
        if (ipHolder !== undefined) {
            this._ipHolder = ipHolder;
        }
        return this;
    }

    /** Lazily parsed query record. Parsed once on first access, then cached. */
    get query(): Record<string, string | string[]> {
        if (this._query === undefined) {
            const url = this._raw.url;
            const q = url.indexOf('?');
            const search = q === -1 ? '' : url.slice(q + 1);
            this._query = parseQuery(search);
        }
        return this._query;
    }

    /** Lazily parsed cookie record. Parsed once on first access, then cached. */
    get cookies(): Record<string, string> {
        if (this._cookies === undefined) {
            this._cookies = parseCookies(this._raw.headers.get('Cookie'));
        }
        return this._cookies;
    }

    /**
     * The socket peer address (never a forwarded header — `X-Forwarded-For`
     * and friends are client-controlled unless a trusted proxy sets them).
     * `undefined` when the runtime does not expose it (WinterCG `fetch`).
     */
    get ip(): string | undefined {
        if (this._ip !== undefined) return this._ip ?? undefined;
        const source = requestIPs.get(this._raw);
        if (source !== undefined) {
            this._ip =
                typeof source === 'string'
                    ? source
                    : (source.requestIP(this._raw)?.address ?? null);
            return this._ip ?? undefined;
        }
        // Per-app server reference (set once at startup): resolve the socket
        // peer lazily and cache it for the request.
        const server = this._ipHolder?.server;
        this._ip = server ? (server.requestIP(this._raw)?.address ?? null) : null;
        return this._ip ?? undefined;
    }

    /** The underlying raw `Request`. */
    get request(): Request {
        return this._raw;
    }

    /**
     * Route path params (seeded from `ctxInit`). Always an object — empty
     * for routes without `[param]` segments — so `ctx.params.id` compiles.
     */
    get params(): Record<string, string> {
        return (this._ctxInit.params ??= {});
    }

    /**
     * Wildcard segments (seeded from `ctxInit`). Always an array — empty
     * for non-wildcard routes.
     */
    get wildcardParams(): string[] {
        return (this._ctxInit.wildcardParams ??= []);
    }

    /**
     * The matched-route identity (seeded from `ctxInit`).
     *
     * Native dynamic routes seed only the `pattern`; the concrete requested
     * `path` is derived here on first access and cached for the request.
     */
    get route(): RouteMeta | undefined {
        const init = this._ctxInit;
        if (init.route === undefined && init.pattern !== undefined) {
            init.route = Object.freeze({
                path: extractPathnameFromUrl(this._raw.url),
                pattern: init.pattern,
            });
        }
        return init.route;
    }

    /** Route-specific configuration from `config.ts`. */
    get config(): RouteConfig | undefined {
        return this._config;
    }

    /**
     * Deployment-platform bindings (`env.MY_KV`, secrets, …), typed via
     * augmentation of `BurgerEnv`. `undefined` when the runtime provides none.
     */
    get env(): BurgerEnv | undefined {
        return this._env;
    }

    /**
     * Platform execution context (`waitUntil`). `undefined` when the
     * runtime does not supply one.
     */
    get executionCtx(): BurgerExecutionContext | undefined {
        return this._executionCtx;
    }

    // --- Delegated standard `Request` surface (read-only accessors) ---

    get headers(): Headers {
        return this._raw.headers;
    }

    get method(): string {
        return this._raw.method;
    }

    get url(): string {
        return this._raw.url;
    }

    get signal(): AbortSignal {
        return this._raw.signal;
    }

    get body(): ReadableStream<Uint8Array> | null {
        return this._raw.body;
    }

    get bodyUsed(): boolean {
        return this._raw.bodyUsed;
    }

    // --- Delegated standard `Request` methods (forward to `_raw`) ---

    /**
     * Parses the request body as JSON with the same semantics as the platform
     * `Request.json()`. The default type is `any` because the shape of
     * arbitrary JSON is unknown; callers can supply the expected shape:
     *
     * ```ts
     * const body = await ctx.json<{ id: number }>();
     * ```
     */
    json<T = any>(): Promise<T> {
        // Parsed once and cached (body validation reads it first). Malformed
        // JSON is a client error: 400 Problem Details, not a 500.
        this._json ??= this._raw.json().catch((error: unknown) => {
            // A parse failure stays cached (a re-read reports the same 400);
            // any other failure (stream already used, …) is not cached.
            if (error instanceof SyntaxError) {
                throw new HTTPError(400, `Malformed JSON body: ${error.message}`, {
                    cause: error,
                });
            }
            this._json = undefined;
            throw error;
        });
        return this._json as Promise<T>;
    }

    text(): Promise<string> {
        return this._raw.text();
    }

    arrayBuffer(): Promise<ArrayBuffer> {
        return this._raw.arrayBuffer();
    }

    blob(): Promise<Blob> {
        return this._raw.blob();
    }

    formData(): Promise<FormData> {
        return this._raw.formData();
    }

    clone(): Request {
        // Delegates to the underlying `Request.clone()`.
        return this._raw.clone();
    }
}

/**
 * Delegation of the full `Request` surface: every `Request.prototype` member
 * not already defined on `BurgerContext` is copied onto the shared prototype
 * once at module load, so instances keep one hidden class.
 */
for (const name of Object.getOwnPropertyNames(Request.prototype)) {
    if (name === 'constructor' || name === 'prototype') continue;
    if (Object.prototype.hasOwnProperty.call(BurgerContext.prototype, name)) {
        continue;
    }
    const desc = Object.getOwnPropertyDescriptor(Request.prototype, name);
    if (!desc) continue;

    if (typeof desc.value === 'function') {
        Object.defineProperty(BurgerContext.prototype, name, {
            value: function (this: any, ...args: any[]) {
                return (this._raw as any)[name](...args);
            },
            writable: true,
            configurable: true,
            enumerable: false,
        });
    } else if (desc.get) {
        Object.defineProperty(BurgerContext.prototype, name, {
            get(this: any) {
                return (this._raw as any)[name];
            },
            configurable: true,
            enumerable: false,
        });
    }
}

/**
 * Freezes the shared prototype's getters so a handler cannot replace them on
 * the prototype and leak state across requests. Delegation methods stay
 * writable/configurable so user hooks can attach custom properties.
 */
for (const name of Object.getOwnPropertyNames(BurgerContext.prototype)) {
    const desc = Object.getOwnPropertyDescriptor(BurgerContext.prototype, name);
    if (!desc || !desc.get || desc.set) continue;
    Object.defineProperty(BurgerContext.prototype, name, {
        configurable: false,
        enumerable: false,
    });
}
