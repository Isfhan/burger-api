import type {
    ContextInit,
    ContextSet,
    RouteAccessInfo,
    RouteMeta,
} from './types.js';
import { parseQuery } from './query-parser.js';
import { parseCookies } from './cookie-parser.js';
import { extractPathnameFromUrl } from '../utils/wildcard.js';
import type { InferValidated } from '../types/inference.js';
import type { RouteMethodSchema } from '../types/inference.js';
import type { RouteConfig } from '../types/index.js';
import { HTTPError } from '../errors/http-error.js';

/**
 * Empty interface for module augmentation. Users extend this to type
 * `ctx.services`:
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
 * Module augmentation target for validated request data (`ctx.validated`).
 * Default slots match the validator (`params`, `query`, `body`, `headers`, `cookies`).
 *
 * With schema-driven inference (`BurgerContext<typeof GET>`), `ctx.validated`
 * is typed from `schema.ts` automatically. Augmentation remains the escape
 * hatch for anything inference cannot express:
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
 * Populated by the serving entry point (`toFetchHandler(burger)` on WinterCG
 * targets receives the platform `env`; Bun leaves it `undefined`):
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
 * Minimal structural view of a platform execution context (the third
 * argument of a WinterCG `fetch(request, env, ctx)` handler). Only
 * `waitUntil` is modeled — the one capability portable code relies on.
 */
export interface BurgerExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
}

/** A server handle that can report a request's peer address (Bun's `Server`). */
export interface RequestIPSource {
    requestIP(request: Request): { address: string } | null | undefined;
}

/**
 * Per-app mutable reference to the serving runtime's IP source.
 *
 * One holder is created per router and stored on every context at creation;
 * the adapter writes the server into it ONCE at startup (Bun's `Server` is
 * stable for the lifetime of `Bun.serve`), so `ctx.ip` resolves lazily with
 * no per-request bookkeeping (no WeakMap write on the hot path).
 */
export interface RequestIPHolder {
    server?: RequestIPSource;
}

/**
 * Shared empty services object handed to every context of an app without
 * `burger.provide()` providers. Frozen: services are app-scoped singletons,
 * never per-request scratch space.
 */
export const EMPTY_SERVICES = Object.freeze(
    Object.create(null) as BurgerServices
) as BurgerServices;

/**
 * Resolves the app-level services for `ctx.services` ONCE (at compile time).
 * Providers are app-scoped singletons, so the resulting bag is shared — and
 * frozen — by every request; a prebuilt object passes through unchanged.
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
 * Per-request client address sources, keyed by the raw `Request`. Set by the
 * serving layer (Bun adapter / router — or a Node adapter via
 * {@link setRequestIP}); read lazily by `ctx.ip`.
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
 * Module augmentation target for adding custom properties to BurgerContext.
 * Use this to type request-scoped values set in `transform` hooks:
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
 * The actual `BurgerContext` class is defined below. This interface exists
 * solely for declaration merging via module augmentation.
 */
export interface BurgerContext {}

/**
 * `BurgerContext` — the public request context type.
 *
 * Exactly **one** instance is allocated per request, via the static
 * `BurgerContext.create` entry point. It is never re-allocated inside the
 * hook pipeline.
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
 * The default type parameter keeps plain `BurgerContext` annotations working
 * (slots fall back to `unknown`, `BurgerValidated` augmentation applies).
 *
 * Design:
 * - One **shared, frozen prototype** carries every lazy getter and every
 * delegated `Request` method. Per-request instances hold **only mutable
 * state** (`_raw`, `_query`, `_cookies`, `validated`, `set`, `services`,
 * `_ctxInit`), so every instance has an identical shape — preserving the
 * monomorphic hidden class.
 * - Fields are parsed **lazily** and **at most once** (single-parse guarantee);
 * a field a route never reads is never parsed and never allocated.
 * - The standard `Request` surface is **delegated** to the underlying `Request`
 * (`_raw`); `BurgerContext` does not extend `Request` and does not copy its
 * state.
 *
 * `BurgerContext` is the object that flows through the hook pipeline and into
 * handlers.
 */
export class BurgerContext<TRoute = unknown> {
    /**
     * The underlying `Request`. Delegated to for the standard `Request` surface.
     * Never copied; only this reference is held.
     *
     * `declare` (never `!`): a definite-assignment field would be re-defined
     * by the class-field transform on every `new BurgerContext()` (Bun emits
     * it), duplicating the assignments `create()` already performs. With
     * `declare` the field exists only in the type system and `create()`
     * defines every property in the same order, so the hidden class is
     * identical for every request.
     */
    declare private _raw: Request;

    /**
     * The route-specific data seeded at creation (params / wildcardParams /
     * route). Exposed via the `params` / `wildcardParams` / `route` getters so
     * the instance shape stays identical for every request.
     */
    declare private _ctxInit: ContextInit;

    /** Cached parsed query (lazy). `undefined` until first access. */
    declare private _query: Record<string, string | string[]> | undefined;

    /** Cached parsed cookies (lazy). `undefined` until first access. */
    declare private _cookies: Record<string, string> | undefined;

    /**
     * Cached `json()` result. `undefined` until the body is parsed (JSON
     * never parses to `undefined`). Lets `ctx.json()` be called again —
     * e.g. in a handler after body validation already read the stream.
     */
    declare private _json: Promise<unknown> | undefined;

    /**
     * Validated data attached by the validation hook. Mutable instance
     * state. Starts `undefined` so the validation hook runs (it
     * short-circuits when `ctx.validated` is already truthy).
     *
     * Typed from `schema.ts` via `BurgerContext<typeof GET>`; falls back to
     * `BurgerValidated` (augmentation) when no generic is supplied.
     *
     * When the route declares a schema (`TRoute extends RouteMethodSchema`),
     * the type is **non-undefined**: handlers run after validation, so
     * `ctx.validated.query` compiles without optional chaining — matching
     * the runtime (a failed validation throws 422 and the handler never
     * runs). A plain `BurgerContext` keeps `| undefined` because a route
     * without a schema never runs the validation hook.
     *
     * `declare` replaces the field initializer: `create()` sets the field to
     * `undefined` at runtime, and the validation hook assigns it through a
     * plain (unparametrized) context.
     */
    declare validated: TRoute extends RouteMethodSchema
        ? InferValidated<TRoute> & BurgerValidated
        : (InferValidated<TRoute> & BurgerValidated) | undefined;

    /**
     * The response-mutation object exposed through `ctx.set`. Allocated
     * LAZILY on first access — the overwhelming majority of requests never
     * mutate the response, so this saves one allocation plus the exit-time
     * `applySet` scan per request. Merged into the response by `applySet`
     * at the pipeline exit; `cookies` is reserved for a future release.
     *
     * Hot-path check: `hasSet()` is the O(1) "did anything mutate" probe
     * used by the pipeline exit instead of scanning a candidate object.
     */
    declare private _set: ContextSet | undefined;

    /** True once anything touched `ctx.set` (lazy allocation marker). */
    hasSet(): boolean {
        return this._set !== undefined;
    }

    get set(): ContextSet {
        return (this._set ??= Object.create(null) as ContextSet);
    }

    set set(value: ContextSet) {
        this._set = value;
    }

    /**
     * Injected application services. Populated by `burger.provide()`.
     * Typed via module augmentation of `BurgerServices`:
     * ```ts
     * declare module "burger-api" {
     * interface BurgerServices {
     * db: Database;
     * mailer: Mailer;
     * }
     * }
     * ```
     *
     * Assigned once in `create()`: apps without `burger.provide()` providers
     * share the frozen `EMPTY_SERVICES` singleton, apps with providers share
     * one frozen object built at compile time — never a per-request copy.
     */
    declare services: BurgerServices;

    /**
     * Route-specific configuration from `config.ts`. Read-only at runtime.
     * Used by hooks/plugins to read route-level settings (auth, cache,
     * timeout, …). Typed via module augmentation of `RouteConfig`.
     */
    declare private _config: RouteConfig | undefined;

    /**
     * Deployment-platform bindings (`env.MY_KV`, secrets, …). Populated by
     * the serving entry point when the platform provides them; `undefined`
     * on runtimes without bindings (e.g. plain Bun `serve()`).
     */
    declare private _env: BurgerEnv | undefined;

    /**
     * Platform execution context (`waitUntil` and friends). Same lifecycle
     * as `_env`: provided by the entry point, carried across re-binding.
     */
    declare private _executionCtx: BurgerExecutionContext | undefined;

    /**
     * Per-app server reference (Bun's `Server`), used to resolve `ctx.ip`
     * lazily. `undefined` on runtimes without a socket server (WinterCG).
     */
    declare private _ipHolder: RequestIPHolder | undefined;

    /**
     * Cached `ctx.ip` result. `null` records "resolved to undefined" so the
     * runtime is queried at most once per request; `undefined` means
     * "not read yet".
     */
    declare private _ip: string | null | undefined;

    /**
     * The single context creation entry point. Thin static method on
     * `BurgerContext` (not a separate factory class) so there is exactly one
     * obvious allocation site.
     *
     * `meta` (a `RouteAccessInfo` hint) is accepted but **ignored at runtime** in
     * behavior never depends on it, because every field is already
     * available lazily on the stable prototype.
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
        // Assignments happen in declaration order so every instance has an
        // identical hidden class (no field initializers exist any more).
        ctx._raw = raw;
        ctx._ctxInit = ctxInit ?? {};
        ctx._query = undefined;
        ctx._cookies = undefined;
        ctx._json = undefined;
        ctx.validated = undefined;
        ctx._set = undefined;
        // A Map (direct `create` callers, e.g. the WS adapter) gets its own
        // shallow copy per context for backward compatibility; a prebuilt
        // services object (the compiled route path) is shared as-is.
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
     * The router creates ONE context per request before routing (so
     * `onRequest` hooks can seed request IDs, counters, auth hints, …) and
     * the dispatched handler then binds that same instance to the matched
     * route instead of allocating a second context. Caches (`query`,
     * `cookies`) stay valid — the underlying `Request` is identical — and
     * any state hooks wrote is preserved.
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
        // Services were already resolved at creation (shared per app) — bind
        // must not rebuild them per request.
        if (config !== undefined) {
            this._config = config as RouteConfig;
        }
        // Platform bindings carry over from the pre-routing context unless a
        // fresh value is supplied by the dispatched route.
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
     * The client's address as seen by the server socket (never a forwarded
     * header — `X-Forwarded-For` / `CF-Connecting-IP` are client-controlled
     * unless a trusted proxy sets them). `undefined` when the runtime does
     * not expose it (WinterCG `fetch` entries).
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
        // Per-app server reference (set once at startup by the Bun adapter):
        // resolve the socket peer lazily and cache it for the request.
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
     * The matched-route identity (seeded from `ctxInit`). Always present.
     *
     * Natively dispatched dynamic routes seed only the route `pattern`; the
     * concrete requested `path` is derived here on first access (never on the
     * hot path) and cached for the request.
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
     * Deployment-platform bindings (`env.MY_KV`, secrets, …). Typed via
     * module augmentation of `BurgerEnv`. `undefined` when the runtime
     * provides no bindings (plain Bun `serve()`).
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
     * Parses the request body as JSON. Mirrors the platform `Request.json()`
     * semantics: the default type is `any` because the shape of arbitrary JSON
     * is unknown; callers can supply the expected shape explicitly:
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
        // Delegate to the underlying `Request.clone()` (returns a `Request`).
        return this._raw.clone();
    }
}

/**
 * Generic delegation of the full Bun `Request` surface.
 *
 * The design requires that *every* member Bun exposes on `Request` be
 * reachable through `BurgerContext` without hand-maintaining a list. Rather
 * than a `Proxy` (which breaks hidden-class optimization and adds per-access
 * trap overhead), we copy the remaining `Request.prototype` members onto the
 * shared `BurgerContext.prototype` **once at module load**. Because this runs
 * exactly once, every `BurgerContext` instance shares the same augmented
 * prototype and therefore the same hidden class — allocations and JIT behavior
 * are unaffected. Members already defined explicitly on `BurgerContext`
 * (`method`, `url`, `headers`, `signal`, `body`, `bodyUsed`, `json`, `text`,
 * `arrayBuffer`, `blob`, `formData`, `clone`) are skipped.
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
 * Freeze the shared prototype's **getters**. The lazy and
 * delegated getters (`query`, `params`, `route`, `headers`, `method`, `url`,
 * `signal`, `body`, `bodyUsed`, plus any generic `Request` getters) are made
 * non-configurable so a handler cannot replace them on the shared prototype and
 * leak state across requests. The delegation **methods** (incl. `json`, `text`,
 * `arrayBuffer`, `blob`, `formData`, `clone`) are intentionally left
 * writable/configurable so user hooks can attach custom properties.
 * (`json()` caches its parsed result per instance, so body validation and
 * the handler can both call it.)
 * Freezing only getters preserves the safety goal and the documented
 * mutability contract without breaking existing validation behavior.
 */
for (const name of Object.getOwnPropertyNames(BurgerContext.prototype)) {
    const desc = Object.getOwnPropertyDescriptor(BurgerContext.prototype, name);
    if (!desc || !desc.get || desc.set) continue;
    Object.defineProperty(BurgerContext.prototype, name, {
        configurable: false,
        enumerable: false,
    });
}
