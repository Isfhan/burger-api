import type { RequestHandler, RouteSchema, openapi } from '../types/index.js';
import type { HTTPMethod } from '../utils/routing.js';
import type { RouteHooks } from '../lifecycle/types.js';
import type { ConventionFile } from './conventions.js';
import type { Hook } from '../lifecycle/types.js';

/**
 * The compiler's internal view of ONE route directory.
 *
 * `RouteModule` is the canonical intermediate produced by the Module Loader
 * and consumed by the Compiler; users never see it. Each route directory is
 * self-contained — no parent/group inheritance; convention data comes from
 * the route's own files only.
 *
 * Fields are carried raw and compiled downstream: `schema` (validation
 * compilation), `hooks` (frozen `HookPlan`), `openapi` (OpenAPI generation),
 * `config` (runtime options such as auth, cache, timeout).
 */
export interface RouteModule {
    /**
     * The resolved API route path, e.g. `/api/users/:id`.
     */
    path: string;

    /**
     * HTTP method handlers from `route.ts` (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS).
     */
    handlers: Partial<Record<HTTPMethod, RequestHandler>>;

    /**
     * Validation definitions from `schema.ts` (compiled at route build time).
     */
    schema?: RouteSchema;

    /**
     * Lifecycle hooks from `hooks.ts` (compiled into a frozen hook plan).
     * Stored raw so the later hook compiler owns the typing.
     */
    hooks?: RouteHooks;

    /**
     * OpenAPI metadata from `openapi.ts` (merged at compile time).
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
 * The Directory Scanner's output for one route directory (one that contains
 * a `route.ts`) and the input to the Module Loader. No module code is
 * imported by the scanner.
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
    /**
     * The rest of the global `src/hooks.ts` (everything but `onRequest`).
     * Compiled once with scope 'global' — never merged into route hooks.
     * Set by the ModuleLoader during `load()`.
     */
    globalRouteHooks?: RouteHooks;
    /** Absolute path to `openapi.config.ts` (sibling of entry point), or undefined. */
    openAPIConfigPath?: string;
    /** Absolute path to `plugins.ts` (sibling of index.ts), or undefined. */
    pluginsPath?: string;
    /** Absolute path to `providers.ts` (sibling of index.ts), or undefined. */
    providersPath?: string;
}
