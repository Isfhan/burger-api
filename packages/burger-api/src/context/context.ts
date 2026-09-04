import type {
    ContextInit,
    ContextSet,
    RouteAccessInfo,
    RouteMeta,
} from './types';
import { parseQuery } from './query-parser';
import { parseCookies } from './cookie-parser';
import type { InferValidated } from '../types/inference';
import type { RouteMethodSchema } from '../types/inference';
import type { RouteConfig } from '../types/index';

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
     */
    private _raw!: Request;

    /**
     * The route-specific data seeded at creation (params / wildcardParams /
     * route). Exposed via the `params` / `wildcardParams` / `route` getters so
     * the instance shape stays identical for every request.
     */
    private _ctxInit!: ContextInit;

    /** Cached parsed query (lazy). `undefined` until first access. */
    private _query?: Record<string, string | string[]>;

    /** Cached parsed cookies (lazy). `undefined` until first access. */
    private _cookies?: Record<string, string>;

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
     * `!` (definite assignment) replaces the initializer: `create()` sets
     * the field to `undefined` at runtime, and the validation hook assigns
     * it through a plain (unparametrized) context.
     */
    validated!: TRoute extends RouteMethodSchema
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
    private _set?: ContextSet;

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
     */
    services: BurgerServices = Object.create(null) as BurgerServices;

    /**
     * Route-specific configuration from `config.ts`. Read-only at runtime.
     * Used by hooks/plugins to read route-level settings (auth, cache,
     * timeout, …). Typed via module augmentation of `RouteConfig`.
     */
    private _config?: RouteConfig;

    /**
     * Deployment-platform bindings (`env.MY_KV`, secrets, …). Populated by
     * the serving entry point when the platform provides them; `undefined`
     * on runtimes without bindings (e.g. plain Bun `serve()`).
     */
    private _env?: BurgerEnv;

    /**
     * Platform execution context (`waitUntil` and friends). Same lifecycle
     * as `_env`: provided by the entry point, carried across re-binding.
     */
    private _executionCtx?: BurgerExecutionContext;

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
        providers?: Map<string, unknown>,
        config?: RouteConfig | Record<string, unknown>,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): BurgerContext {
        const ctx = new BurgerContext();
        ctx._raw = raw;
        ctx._ctxInit = ctxInit ?? {};
        ctx._query = undefined;
        ctx._cookies = undefined;
        ctx.validated = undefined;
        ctx._set = undefined;
        ctx.services = (
            providers ? Object.fromEntries(providers) : Object.create(null)
        ) as BurgerServices;
        // Route config is opaque user data until `RouteConfig` is augmented.
        ctx._config = config as RouteConfig;
        ctx._env = env ?? undefined;
        ctx._executionCtx = executionCtx ?? undefined;
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
        providers?: Map<string, unknown>,
        config?: RouteConfig | Record<string, unknown>,
        env?: BurgerEnv,
        executionCtx?: BurgerExecutionContext
    ): this {
        this._raw = raw;
        this._ctxInit = ctxInit ?? this._ctxInit;
        if (providers) {
            this.services = Object.fromEntries(
                providers
            ) as unknown as BurgerServices;
        }
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

    /** The underlying raw `Request`. */
    get request(): Request {
        return this._raw;
    }

    /** Route path params (seeded from `ctxInit`). Undefined for non-param routes. */
    get params(): Record<string, string> | undefined {
        return this._ctxInit.params;
    }

    /** Wildcard segments (seeded from `ctxInit`). Undefined for non-wildcard routes. */
    get wildcardParams(): string[] | undefined {
        return this._ctxInit.wildcardParams;
    }

    /** The matched-route identity (seeded from `ctxInit`). Always present. */
    get route(): RouteMeta | undefined {
        return this._ctxInit.route;
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
        return this._raw.json();
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
 * writable/configurable so the framework can reassign `req.json` per instance
 * (validator.ts) and user hooks can attach custom properties.
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
