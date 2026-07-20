import type { RequestHandler, RouteSchema, openapi } from '../types/index';
import type { ConventionFile } from './conventions';

/**
 * The compiler's internal view of ONE route directory.
 *
 * `RouteModule` is the canonical intermediate produced by the Module Loader and
 * consumed by the Compiler. Users never see it; it exists so the compiler has a
 * single object to discover, validate, optimize, and emit (`ROADMAP.md` §2.1).
 *
 * Phase 1 carries the convention data through verbatim. Later phases compile
 * each field:
 * - `schema`       → Phase 3 (validation compilation)
 * - `hooks`        → Phase 4 (hook compilation into a frozen `HookPlan`)
 * - `capabilities` → Phase 4 (plugin composition from `use.ts`)
 * - `openapi`      → Phase 6 (OpenAPI generation)
 * - `webhook`      → Phase 7 (webhook runtime)
 *
 * Until those phases land, the fields are kept in their raw, uncompiled form
 * (typed loosely) so the pipeline is end-to-end operational without executing
 * any future-phase logic.
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
     * Capability/plugin declarations from `use.ts` (uncompiled; Phase 4).
     * Typically the module's default export array; kept raw here.
     */
    capabilities?: unknown;

    /**
     * Documentation metadata from `openapi.ts` (uncompiled; Phase 6).
     */
    openapi?: openapi;

    /**
     * Webhook definition from `webhook.ts` (uncompiled; Phase 7).
     */
    webhook?: unknown;

    /**
     * The chain of ancestor group folder names, ordered root → nearest.
     * Used by the Module Loader to resolve group inheritance (nearest-last).
     */
    groupChain: string[];

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
 * A group-level inheritance source: the convention files discovered in one
 * ancestor group directory. `closest` is false for root-ward groups and true
 * for the nearest ancestor; the Module Loader merges nearest-last.
 */
export interface GroupInheritanceSource {
    /** Absolute path of the group directory. */
    dir: string;
    /** Convention files present in this group directory. */
    files: Partial<Record<ConventionFile, string>>;
}

/**
 * The Directory Scanner's output for a single route directory (one that
 * contains a `route.ts`). It is the *input* to the Module Loader — a pure
 * inventory plus the resolved route path and the inheritance chain. No module
 * code is imported by the scanner; only the Module Loader imports.
 */
export interface ScannedRoute {
    /** Resolved API route path, e.g. `/api/users/:id`. */
    routePath: string;
    /** Absolute path of the directory containing `route.ts`. */
    routeDir: string;
    /** Convention files present directly in this route directory. */
    localFiles: Partial<Record<ConventionFile, string>>;
    /**
     * Ancestor group directories (root → nearest) and their inheritable
     * convention files. Empty when the route has no group ancestors.
     */
    groupFiles: GroupInheritanceSource[];
    /**
     * The chain of group folder names, ordered root → nearest. Mirrors the
     * names encoded in {@link groupFiles} and is retained for introspection
     * and deterministic conflict reporting.
     */
    groupChain: string[];
    /** True when the route path contains a wildcard (`*`) segment. */
    isWildcard: boolean;
}
