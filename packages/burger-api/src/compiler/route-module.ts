import type { RequestHandler, RouteSchema, openapi } from '../types/index';
import type { ConventionFile } from './conventions';
import type { Hook } from '../lifecycle/types';

/**
 * The compiler's internal view of ONE route directory.
 *
 * `RouteModule` is the canonical intermediate produced by the Module Loader and
 * consumed by the Compiler. Users never see it; it exists so the compiler has a
 * single object to discover, validate, optimize, and emit (`ROADMAP.md` §2.1).
 *
 * Each route directory is **self-contained** — no parent/group inheritance.
 * Convention data is loaded from the route's own files only.
 *
 * Fields are carried raw through Phase 1 and compiled in later phases:
 * - `schema`  → Phase 3 (validation compilation)
 * - `hooks`   → Phase 4 (hook compilation into a frozen `HookPlan`)
 * - `openapi` → Phase 6 (OpenAPI generation)
 * - `config`  → Attached for runtime use (auth, cache, timeout, …)
 */
export interface RouteModule {
    /**
     * The resolved API route path, e.g. `/api/users/:id`.
     */
    path: string;

    /**
     * HTTP method handlers from `route.ts` (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS).
     */
    handlers: { [method: string]: RequestHandler };

    /**
     * Validation definitions from `schema.ts` (uncompiled; Phase 3).
     */
    schema?: RouteSchema;

    /**
     * Lifecycle hooks from `hooks.ts` (uncompiled; Phase 4).
     * Stored raw so the later hook compiler owns the typing.
     */
    hooks?: Record<string, unknown>;

    /**
     * Documentation metadata from `openapi.ts` (uncompiled; Phase 6).
     */
    openapi?: openapi;

    /**
     * Per-route configuration from `config.ts` (auth, cache, timeout, …).
     */
    config?: Record<string, unknown>;

    /**
     * Absolute paths of the convention files that were loaded for this module,
     * keyed by convention file stem. Retained for introspection/error reporting.
     */
    sourceFiles: Partial<Record<ConventionFile, string>>;

    /**
     * True when the route path contains a wildcard (`*`) segment.
     */
    isWildcard: boolean;
}

/**
 * The Directory Scanner's output for a single route directory (one that
 * contains a `route.ts`). It is the *input* to the Module Loader — a pure
 * inventory plus the resolved route path. No module code is imported by the
 * scanner; only the Module Loader imports.
 *
 * Each route directory is self-contained — no group inheritance chain.
 */
export interface ScannedRoute {
    /** Resolved API route path, e.g. `/api/users/:id`. */
    routePath: string;
    /** Absolute path of the directory containing `route.ts`. */
    routeDir: string;
    /** Convention files present directly in this route directory. */
    localFiles: Partial<Record<ConventionFile, string>>;
    /** True when the route path contains a wildcard (`*`) segment. */
    isWildcard: boolean;
}

/**
 * The Directory Scanner's full output — a list of routes plus the path to
 * the global hooks file (if any) at the app root.
 */
export interface ScanResult {
    routes: ScannedRoute[];
    /** Absolute path to the global `hooks.ts` file (sibling of index.ts), or undefined. */
    globalHooks?: string;
    /**
     * `onRequest` hooks extracted from global `src/hooks.ts`. These run
     * before routing (pre-routing, app-level) and must NOT be merged per-route.
     * Extracted by the ModuleLoader during `load()`.
     */
    globalOnRequest?: Hook[];
    /** Absolute path to `openapi.config.ts` (sibling of entry point), or undefined. */
    openAPIConfigPath?: string;
    /** Absolute path to `plugins.ts` (sibling of index.ts), or undefined. */
    pluginsPath?: string;
    /** Absolute path to `providers.ts` (sibling of index.ts), or undefined. */
    providersPath?: string;
}
