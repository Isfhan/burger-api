import { HTTP_METHODS } from '../utils/routing.js';
import type { HTTPMethod } from '../utils/routing.js';
import {
    warnUnknownHookExports,
    warnUnknownRouteExports,
} from './conventions.js';
import type {
    openapi,
    OpenAPIConfig,
    RequestHandler,
    RouteSchema,
} from '../types/index.js';
import type { RouteHooks } from '../lifecycle/types.js';
import type { RouteModule, ScannedRoute, ScanResult } from './route-module.js';
import type { Hook } from '../lifecycle/types.js';

/** Uppercase HTTP method names for schema export detection. */
const HTTP_METHOD_SET: ReadonlySet<string> = new Set(HTTP_METHODS);

/**
 * Detects uppercase method exports in a schema module and normalizes them
 * into the method-keyed `RouteSchema` format. Lowercase keys pass through
 * unchanged.
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
 * Normalizes uppercase method exports from `openapi.ts` into the lowercase
 * method-keyed format expected by `generateOpenAPIDocument`.
 *
 * @example
 * ```ts
 * // openapi.ts — named exports per HTTP method
 * export const GET = { summary: 'List', tags: ['posts'] };
 *
 * // → normalized: { get: { summary: 'List', tags: ['posts'] } }
 * ```
 */
function normalizeOpenapi(raw: Record<string, unknown>): openapi {
    const merged: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) {
        if (HTTP_METHOD_SET.has(key)) {
            merged[key.toLowerCase()] = raw[key];
        } else {
            merged[key] = raw[key];
        }
    }
    return merged as openapi;
}

/**
 * The second stage of the compiler pipeline.
 *
 * Consumes the inventory from {@link DirectoryScanner} and, for each route
 * directory, `import()`s its convention files and assembles one
 * {@link RouteModule}. Each route directory is self-contained — only its own
 * files are loaded. Convention data stays raw for downstream compilation;
 * `config` is attached for runtime use. Fails fast on duplicate route paths.
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
        let globalHooks = scanned.globalHooks
            ? await this.loadOptional<Record<string, unknown>>(
                  scanned.globalHooks
              )
            : undefined;
        warnUnknownHookExports(globalHooks, scanned.globalHooks ?? '', 'global');

        // Extract onRequest from global hooks — these run before routing
        // (pre-routing, app-level) and must NOT be merged per-route.
        const globalOnRequest = this.extractOnRequest(globalHooks);
        if (globalOnRequest.length > 0) {
            scanned.globalOnRequest = globalOnRequest;
            // Strip onRequest from merged global hooks so it's not duplicated per-route.
            // ESM module namespaces are frozen — clone without onRequest instead of delete.
            if (globalHooks) {
                const { onRequest: _, ...rest } = globalHooks;
                globalHooks =
                    Object.keys(rest).length > 0
                        ? (rest as Record<string, unknown>)
                        : undefined;
            }
        }

        // The remaining global hooks are compiled with scope 'global' by the
        // router compiler (NOT merged into each route's hooks), so response
        // and error hooks run nearest-first (route → global).
        scanned.globalRouteHooks = globalHooks as RouteHooks | undefined;

        for (const route of scanned.routes) {
            const mod = await this.loadOne(route);
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

    private async loadOne(route: ScannedRoute): Promise<RouteModule> {
        // 1. Import route.ts (handlers + any inline convention exports).
        const routeMod = await import(route.localFiles.route!);
        warnUnknownRouteExports(routeMod, route.localFiles.route!, HTTP_METHODS);
        const handlers = this.extractHandlers(routeMod);

        // 2. Load convention files from this route's own directory only.
        const rawSchema = await this.loadOptional<Record<string, unknown>>(
            route.localFiles.schema
        );
        const schema = rawSchema ? normalizeSchema(rawSchema) : undefined;
        const rawOpenapi = await this.loadOptional<Record<string, unknown>>(
            route.localFiles.openapi
        );
        const openapi = rawOpenapi ? normalizeOpenapi(rawOpenapi) : undefined;
        const hooks = await this.loadOptional<Record<string, unknown>>(
            route.localFiles.hooks
        );
        warnUnknownHookExports(hooks, route.localFiles.hooks ?? '', 'route');
        const config = await this.loadConfig(route.localFiles.config);

        // 3. Overlay inline exports from route.ts. Route-local inline wins
        // over separate files.
        const finalSchema = (routeMod.schema as RouteSchema) ?? schema;
        const finalOpenapi = (routeMod.openapi as openapi) ?? openapi;
        const finalHooks = this.mergeHookObjects(
            hooks,
            routeMod.hooks as Record<string, unknown> | undefined
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
     * Extracts HTTP method handlers from a `route.ts` module. (The router
     * compiler adds the framework OPTIONS handler to every route that does
     * not define one.)
     */
    private extractHandlers(mod: Record<string, unknown>): Partial<
        Record<HTTPMethod, RequestHandler>
    > {
        const handlers: Partial<Record<HTTPMethod, RequestHandler>> = {};
        for (const method of HTTP_METHODS) {
            if (typeof mod[method] === 'function') {
                handlers[method] = mod[method] as RequestHandler;
            }
        }

        return handlers;
    }

    /**
     * Extracts `onRequest` hooks from a raw hook object.
     * Returns them as an array (normalizing single hook or array).
     */
    private extractOnRequest(hooks?: Record<string, unknown>): Hook[] {
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
     * Loads `config.ts`. The default export (or the module namespace when
     * there is no default) carries route-wide options; uppercase method
     * exports are per-method overrides, kept under their uppercase keys and
     * resolved per method at route compile time.
     *
     * A file with only a default export returns that object unchanged, so
     * `ctx.config` keeps the exact object identity it had before.
     */
    private async loadConfig(
        filePath?: string
    ): Promise<Record<string, unknown> | undefined> {
        if (!filePath) return undefined;
        const mod = (await import(filePath)) as Record<string, unknown>;
        const hasMethodExport = Object.keys(mod).some((key) =>
            HTTP_METHOD_SET.has(key)
        );
        if (!hasMethodExport) {
            return (mod.default ?? mod) as Record<string, unknown>;
        }

        const base = mod.default;
        const merged: Record<string, unknown> = {};
        if (base !== null && typeof base === 'object') {
            Object.assign(merged, base);
        } else if (base === undefined) {
            // No default: non-method named exports stay route-wide.
            for (const [key, value] of Object.entries(mod)) {
                if (!HTTP_METHOD_SET.has(key)) merged[key] = value;
            }
        }
        for (const [key, value] of Object.entries(mod)) {
            if (HTTP_METHOD_SET.has(key)) merged[key] = value;
        }
        return merged;
    }

    /**
     * Loads the `openapi.config.ts` convention file from the scanned result.
     * Returns the config object, or undefined if no config file was discovered.
     */
    async loadOpenAPIConfig(
        scanned: ScanResult
    ): Promise<OpenAPIConfig | undefined> {
        return this.loadOptional<OpenAPIConfig>(scanned.openAPIConfigPath);
    }

    /**
     * Loads the `plugins.ts` convention file from the scanned result.
     * Returns the module, or undefined if no plugins file was discovered.
     */
    async loadPlugins(
        scanned: ScanResult
    ): Promise<Record<string, unknown> | undefined> {
        return this.loadOptional<Record<string, unknown>>(scanned.pluginsPath);
    }

    /**
     * Loads the `providers.ts` convention file from the scanned result.
     * Returns the module, or undefined if no providers file was discovered.
     */
    async loadProviders(
        scanned: ScanResult
    ): Promise<Record<string, unknown> | undefined> {
        return this.loadOptional<Record<string, unknown>>(
            scanned.providersPath
        );
    }

    /**
     * Merges two resolved hook objects (e.g. `hooks.ts` and inline `route.ts`
     * `hooks`). Array-valued keys are concatenated (base first); `transform`
     * is deep-merged; other values are overridden by `override`. Returns
     * undefined when both are empty.
     *
     * The cast here is the dynamic-module boundary: convention files import as
     * `Record<string, unknown>`, and this merge narrows the shape to
     * `RouteHooks`.
     */
    private mergeHookObjects(
        base: Record<string, unknown> | RouteHooks | undefined,
        override: Record<string, unknown> | RouteHooks | undefined
    ): RouteHooks | undefined {
        const result: Record<string, unknown> = { ...(base ?? {}) };
        for (const key of Object.keys(override ?? {})) {
            const b = result[key];
            const o = (override as Record<string, unknown>)[key];
            if (key === 'transform') {
                result[key] = {
                    ...((b as Record<string, unknown>) ?? {}),
                    ...((o as Record<string, unknown>) ?? {}),
                };
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
        return Object.keys(result).length > 0
            ? (result as RouteHooks)
            : undefined;
    }
}
