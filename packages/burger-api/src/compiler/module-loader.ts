import { HTTP_METHODS } from '../utils/routing';
import { autoOptionsHandler } from '../utils/response';
import type { openapi, RequestHandler, RouteSchema } from '../types/index';
import type { RouteModule, ScannedRoute, ScanResult } from './route-module';
import type { Hook } from '../lifecycle/types';

/** Uppercase HTTP method names for schema export detection. */
const HTTP_METHOD_SET = new Set(HTTP_METHODS);

/**
 * Detects uppercase method exports in a schema module and normalizes them
 * into the method-keyed `RouteSchema` format.
 *
 * If the module exports `GET`, `POST`, etc. (uppercase), they are merged
 * into `{ get: { body, ... }, post: { body, ... } }`. Lowercase keys
 * pass through unchanged for backward compatibility.
 */
function normalizeSchema(raw: Record<string, unknown>): RouteSchema {
    const keys = Object.keys(raw);
    const hasUpper = keys.some((k) => HTTP_METHOD_SET.has(k));

    if (!hasUpper) {
        // Already in method-keyed format or no recognizable methods.
        return raw as RouteSchema;
    }

    const merged: Record<string, unknown> = {};
    for (const key of keys) {
        if (HTTP_METHOD_SET.has(key)) {
            merged[key.toLowerCase()] = raw[key];
        } else {
            // Non-method keys pass through (e.g. `coerce`).
            merged[key] = raw[key];
        }
    }
    return merged as RouteSchema;
}

/**
 * The second stage of the compiler pipeline (`ROADMAP.md` §2.1 step 2).
 *
 * Consumes the pure inventory produced by {@link DirectoryScanner} and, for
 * each route directory, `import()`s its convention files and assembles one
 * {@link RouteModule}.
 *
 * Each route directory is **self-contained** — no group inheritance merging.
 * Only the route's own files are loaded.
 *
 * Phase 1 keeps convention data raw — `hooks` are carried through verbatim
 * and compiled in Phase 4. `config` is attached for runtime use.
 *
 * The loader fails fast on duplicate resolved route paths, matching the
 * compiler's "loud and early" contract (`ROADMAP.md` §6.3).
 */
export class ModuleLoader {
    /**
     * Loads and assembles every scanned route into a `RouteModule`.
     * @throws on duplicate resolved route paths.
     */
    async load(scanned: ScanResult): Promise<RouteModule[]> {
        const modules: RouteModule[] = [];
        const seenPaths = new Set<string>();

        // Load global hooks once (shared across all routes).
        const globalHooks = scanned.globalHooks
            ? await this.loadOptional<Record<string, unknown>>(scanned.globalHooks)
            : undefined;

        // Extract onRequest from global hooks — these run before routing
        // (pre-routing, app-level) and must NOT be merged per-route.
        const globalOnRequest = this.extractOnRequest(globalHooks);
        if (globalOnRequest.length > 0) {
            scanned.globalOnRequest = globalOnRequest;
            // Strip onRequest from merged global hooks so it's not duplicated per-route
            delete globalHooks?.onRequest;
        }

        for (const route of scanned.routes) {
            const mod = await this.loadOne(route, globalHooks);
            if (seenPaths.has(mod.path)) {
                throw new Error(
                    `Duplicate route path registered: "${mod.path}". ` +
                        `Two route directories resolve to the same URL.`
                );
            }
            seenPaths.add(mod.path);
            modules.push(mod);
        }
        return modules;
    }

    private async loadOne(
        route: ScannedRoute,
        globalHooks?: Record<string, unknown>
    ): Promise<RouteModule> {
        // 1. Import route.ts (handlers + any inline convention exports).
        const routeMod = await import(route.localFiles.route!);
        const handlers = this.extractHandlers(routeMod);

        // 2. Load convention files from this route's own directory only.
        const rawSchema = await this.loadOptional<Record<string, unknown>>(route.localFiles.schema);
        const schema = rawSchema ? normalizeSchema(rawSchema) : undefined;
        const openapi = await this.loadOptional<openapi>(route.localFiles.openapi);
        const hooks = await this.loadOptional<Record<string, unknown>>(route.localFiles.hooks);
        const config = await this.loadOptional<Record<string, unknown>>(route.localFiles.config);

        // 3. Overlay inline exports from route.ts. Route-local inline wins
        //    over separate files.
        const finalSchema = (routeMod.schema as RouteSchema) ?? schema;
        const finalOpenapi = (routeMod.openapi as openapi) ?? openapi;
        const routeHooks = this.mergeHookObjects(
            hooks,
            routeMod.hooks as Record<string, unknown> | undefined
        );

        // 4. Merge global hooks with route-specific hooks.
        //    Global hooks run first, then route hooks (execution priority).
        const finalHooks = this.mergeHookObjects(
            globalHooks,
            routeHooks
        );

        const sourceFiles = { ...route.localFiles };

        return {
            path: route.routePath,
            handlers,
            schema: finalSchema,
            openapi: finalOpenapi,
            hooks: finalHooks,
            config,
            sourceFiles,
            isWildcard: route.isWildcard,
        };
    }

    /**
     * Extracts HTTP method handlers from a `route.ts` module. Auto-injects a
     * minimal `OPTIONS` handler for preflight-triggering methods when the
     * module does not define one (ported from core/api-router.ts).
     */
    private extractHandlers(
        mod: Record<string, unknown>
    ): { [method: string]: RequestHandler } {
        const handlers: { [method: string]: RequestHandler } = {};
        for (const method of HTTP_METHODS) {
            if (typeof mod[method] === 'function') {
                handlers[method] = mod[method] as RequestHandler;
            }
        }

        const PREFLIGHT = ['POST', 'PUT', 'DELETE', 'PATCH'];
        const hasPreflight = PREFLIGHT.some((m) => handlers[m]);
        if (hasPreflight && typeof handlers.OPTIONS !== 'function') {
            handlers.OPTIONS = autoOptionsHandler;
        }
        return handlers;
    }

    /**
     * Extracts `onRequest` hooks from a raw hook object.
     * Returns them as an array (normalizing single hook or array).
     */
    private extractOnRequest(
        hooks?: Record<string, unknown>
    ): Hook[] {
        if (!hooks?.onRequest) return [];
        const h = hooks.onRequest;
        return Array.isArray(h) ? (h as Hook[]) : [h as Hook];
    }

    /**
     * Loads a module from an optional file path. Returns undefined when
     * the path is not provided.
     */
    private async loadOptional<T>(filePath?: string): Promise<T | undefined> {
        if (!filePath) return undefined;
        const mod = await import(filePath);
        return (mod.default ?? mod) as T;
    }

    /**
     * Merges two already-resolved hook objects (e.g. from `hooks.ts` files and
     * inline `route.ts` `hooks`). For array-valued hook keys both arrays are
     * concatenated (base first, then override); scalar/object values are
     * overridden by `override`. The `transform` key is deep-merged (base then
     * override). Returns undefined when both are empty.
     */
    private mergeHookObjects(
        base: Record<string, unknown> | undefined,
        override: Record<string, unknown> | undefined
    ): Record<string, unknown> | undefined {
        const result: Record<string, unknown> = { ...(base ?? {}) };
        for (const key of Object.keys(override ?? {})) {
            const b = result[key];
            const o = (override as Record<string, unknown>)[key];
            if (key === 'transform') {
                result[key] = { ...(b as Record<string, unknown> ?? {}), ...(o as Record<string, unknown> ?? {}) };
            } else if (Array.isArray(b) && Array.isArray(o)) {
                result[key] = [...b, ...o];
            } else if (Array.isArray(b)) {
                result[key] = [...b, o];
            } else if (Array.isArray(o)) {
                result[key] = b !== undefined ? [b, ...o] : o;
            } else if (b !== undefined) {
                result[key] = [b, o];
            } else {
                result[key] = o;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }
}
