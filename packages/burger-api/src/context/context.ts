import type {
    ContextInit,
    ContextSet,
    RouteAccessInfo,
    RouteMeta,
} from './types';
import { parseQuery } from './query-parser';
import { parseCookies } from './cookie-parser';

/**
 * Empty interface for module augmentation. Users extend this to type
 * `ctx.services`:
 *
 * ```ts
 * declare module "burger-api" {
 *   interface BurgerServices {
 *     db: Database;
 *     logger: Logger;
 *   }
 * }
 * ```
 */
export interface BurgerServices {}

/**
 * Module augmentation target for adding custom properties to BurgerContext.
 * Use this to type request-scoped values set in `transform` hooks:
 *
 * ```ts
 * declare module "burger-api" {
 *   interface BurgerContext {
 *     user: User;
 *     session: Session;
 *     tenant: Tenant;
 *   }
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
 * Design:
 * - One **shared, frozen prototype** carries every lazy getter and every
 *   delegated `Request` method. Per-request instances hold **only mutable
 *   state** (`_raw`, `_query`, `_cookies`, `validated`, `set`, `services`,
 *   `_ctxInit`), so every instance has an identical shape — preserving the
 *   monomorphic hidden class.
 * - Fields are parsed **lazily** and **at most once** (single-parse guarantee);
 *   a field a route never reads is never parsed and never allocated.
 * - The standard `Request` surface is **delegated** to the underlying `Request`
 *   (`_raw`); `BurgerContext` does not extend `Request` and does not copy its
 *   state.
 *
 * `BurgerContext` is the object that flows through the hook pipeline and into
 * handlers.
 */
export class BurgerContext {
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
     */
    validated: Record<string, unknown> | undefined = undefined;

    /**
     * The response-mutation object exposed through `ctx.set`. Mutable instance
     * state; merged into the response by `applySet` at the pipeline exit.
     * `cookies` is reserved for Phase 7.
     */
    set: ContextSet = Object.create(null);

    /**
     * Injected application services. Populated by `burger.provide()` (Phase 4).
     * Typed via module augmentation of `BurgerServices`:
     * ```ts
     * declare module "burger-api" {
     *   interface BurgerServices {
     *     db: Database;
     *     mailer: Mailer;
     *   }
     * }
     * ```
     */
    services: Record<string, unknown> = Object.create(null);

    /**
     * Route-specific configuration from `config.ts`. Read-only at runtime.
     * Used by hooks/plugins to read route-level settings (auth, cache, timeout, …).
     */
    private _config?: Record<string, unknown>;

    /**
     * The single context creation entry point. Thin static method on
     * `BurgerContext` (not a separate factory class) so there is exactly one
     * obvious allocation site.
     *
     * `meta` (a `RouteAccessInfo` hint) is accepted but **ignored at runtime** in
     * Phase 2 — behavior never depends on it, because every field is already
     * available lazily on the stable prototype.
     */
    static create(
        raw: Request,
        ctxInit?: ContextInit,
        _meta?: RouteAccessInfo,
        providers?: Map<string, unknown>,
        config?: Record<string, unknown>
    ): BurgerContext {
        const ctx = new BurgerContext();
        ctx._raw = raw;
        ctx._ctxInit = ctxInit ?? {};
        ctx._query = undefined;
        ctx._cookies = undefined;
        ctx.validated = undefined;
        ctx.set = Object.create(null);
        ctx.services = providers ? Object.fromEntries(providers) : Object.create(null);
        ctx._config = config;
        return ctx;
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

    /** The matched-route identity (seeded from `ctxInit`). Always present in Phase 2. */
    get route(): RouteMeta | undefined {
        return this._ctxInit.route;
    }

    /** Route-specific configuration from `config.ts`. */
    get config(): Record<string, unknown> | undefined {
        return this._config;
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

    json(): Promise<any> {
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
 * ROADMAP-phase2 §6.1.1 asks that *every* member Bun exposes on `Request` be
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
 * Freeze the shared prototype's **getters** (ROADMAP-phase2 §13). The lazy and
 * delegated getters (`query`, `params`, `route`, `headers`, `method`, `url`,
 * `signal`, `body`, `bodyUsed`, plus any generic `Request` getters) are made
 * non-configurable so a handler cannot replace them on the shared prototype and
 * leak state across requests. The delegation **methods** (incl. `json`, `text`,
 * `arrayBuffer`, `blob`, `formData`, `clone`) are intentionally left
 * writable/configurable so the framework can reassign `req.json` per instance
 * (validator.ts) and user hooks can attach custom properties (§6.1.4).
 * Freezing only getters preserves both the §13 safety goal and the documented
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
