import { HTTP_METHODS } from '../utils/routing';
import { autoOptionsHandler } from '../utils/response';
import type { openapi, RequestHandler, RouteSchema } from '../types/index';
import {
    INHERITABLE_FILES,
    type ConventionFile,
} from './conventions';
import type { RouteModule, ScannedRoute } from './route-module';

/**
 * The second stage of the compiler pipeline (`ROADMAP.md` §2.1 step 2).
 *
 * Consumes the pure inventory produced by {@link DirectoryScanner} and, for
 * each route directory, `import()`s its convention files, merges group
 * inheritance (nearest-last, deterministic), and assembles one
 * {@link RouteModule}.
 *
 * Phase 1 keeps the convention data raw — `hooks`/`capabilities`/`webhook` are
 * carried through verbatim and compiled in later phases (4/7). Group merging
 * here is structural only:
 * - `schema` / `openapi`: route-local overrides the inherited file (no deep merge).
 * - `hooks` / `capabilities`: arrays are appended group → route (nearest-last).
 *
 * The loader fails fast on duplicate resolved route paths, matching the
 * compiler's "loud and early" contract (`ROADMAP.md` §6.3).
 */
export class ModuleLoader {
    /**
     * Loads and assembles every scanned route into a `RouteModule`.
     * @throws on duplicate resolved route paths.
     */
    async load(scanned: ScannedRoute[]): Promise<RouteModule[]> {
        const modules: RouteModule[] = [];
        const seenPaths = new Set<string>();

        for (const route of scanned) {
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
        const handlers = this.extractHandlers(routeMod);

        // 2. Collect inheritable group files (root → nearest) for merging.
        const inherited: Partial<Record<ConventionFile, string>> = {};
        for (const group of route.groupFiles) {
            for (const key of INHERITABLE_FILES) {
                const file = group.files[key];
                if (file) inherited[key] = file; // nearest wins (override order)
            }
        }

        // 3. Merge each concern from separate convention files (group → local).
        const fileSchema = await this.mergeOverride<RouteSchema>(
            inherited.schema,
            route.localFiles.schema
        );
        const fileOpenapi = await this.mergeOverride<openapi>(
            inherited.openapi,
            route.localFiles.openapi
        );
        const fileHooks = await this.mergeHooks(
            inherited.hooks,
            route.localFiles.hooks
        );
        const fileCapabilities = await this.mergeCapabilities(
            inherited.use,
            route.localFiles.use
        );
        const fileWebhook = route.localFiles.webhook
            ? (await import(route.localFiles.webhook)).default
            : undefined;

        // 4. Overlay inline exports from route.ts. Route-local inline wins over
        //    separate files; matches the original ApiRouter, which read schema/
        //    openapi/middleware as named exports from route.ts.
        const schema = (routeMod.schema as RouteSchema) ?? fileSchema;
        const openapi = (routeMod.openapi as openapi) ?? fileOpenapi;
        const hooks = this.mergeHookObjects(
            fileHooks,
            routeMod.hooks as Record<string, unknown> | undefined
        );
        const capabilities = this.mergeCapabilityArrays(
            fileCapabilities,
            routeMod.use as unknown
        );
        const webhook = (routeMod.webhook as unknown) ?? fileWebhook;

        const sourceFiles: Partial<Record<ConventionFile, string>> = {
            ...inherited,
            ...route.localFiles,
        };

        return {
            path: route.routePath,
            handlers,
            schema,
            openapi,
            hooks,
            capabilities,
            webhook,
            groupChain: [...route.groupChain],
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
     * Route-local file overrides the inherited one (no deep merge). Returns
     * undefined when neither exists.
     */
    private async mergeOverride<T>(
        inheritedFile?: string,
        localFile?: string
    ): Promise<T | undefined> {
        if (localFile) {
            const mod = await import(localFile);
            return (mod.default ?? mod) as T;
        }
        if (inheritedFile) {
            const mod = await import(inheritedFile);
            return (mod.default ?? mod) as T;
        }
        return undefined;
    }

    /**
     * Merges `hooks.ts` across group → route. For array-valued hook keys the
     * group array is concatenated before the route array (nearest-last
     * append); scalar/object values are overridden by the route-local file.
     */
    private async mergeHooks(
        inheritedFile?: string,
        localFile?: string
    ): Promise<Record<string, unknown> | undefined> {
        const result: Record<string, unknown> = {};
        const inherited = inheritedFile
            ? await import(inheritedFile)
            : undefined;
        const local = localFile ? await import(localFile) : undefined;

        const keys = new Set([
            ...(inherited ? Object.keys(inherited) : []),
            ...(local ? Object.keys(local) : []),
        ]);
        for (const key of keys) {
            const g = inherited?.[key];
            const r = local?.[key];
            if (Array.isArray(g) && Array.isArray(r)) {
                result[key] = [...g, ...r];
            } else if (r !== undefined) {
                result[key] = r;
            } else if (g !== undefined) {
                result[key] = g;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }

    /**
     * Merges `use.ts` capability arrays across group → route (nearest-last
     * append). Each `use.ts` exports its capabilities as the default export.
     */
    private async mergeCapabilities(
        inheritedFile?: string,
        localFile?: string
    ): Promise<unknown[] | undefined> {
        const out: unknown[] = [];
        if (inheritedFile) {
            const mod = await import(inheritedFile);
            const caps = mod.default;
            if (Array.isArray(caps)) out.push(...caps);
        }
        if (localFile) {
            const mod = await import(localFile);
            const caps = mod.default;
            if (Array.isArray(caps)) out.push(...caps);
        }
        return out.length > 0 ? out : undefined;
    }

    /**
     * Merges two already-resolved hook objects (e.g. from `hooks.ts` files and
     * inline `route.ts` `hooks`). For array-valued hook keys both arrays are
     * concatenated (base first, then override); scalar/object values are
     * overridden by `override`. Returns undefined when both are empty.
     */
    private mergeHookObjects(
        base: Record<string, unknown> | undefined,
        override: Record<string, unknown> | undefined
    ): Record<string, unknown> | undefined {
        const result: Record<string, unknown> = { ...(base ?? {}) };
        for (const key of Object.keys(override ?? {})) {
            const b = result[key];
            const o = (override as Record<string, unknown>)[key];
            if (Array.isArray(b) && Array.isArray(o)) {
                result[key] = [...b, ...o];
            } else {
                result[key] = o;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }

    /**
     * Merges two already-resolved capability arrays (e.g. from `use.ts` files
     * and inline `route.ts` `use`). The override (route-local) array is appended
     * after the base (group-inherited) array (nearest-last).
     */
    private mergeCapabilityArrays(
        base: unknown[] | undefined,
        override: unknown
    ): unknown[] | undefined {
        const out: unknown[] = [];
        if (Array.isArray(base)) out.push(...base);
        if (Array.isArray(override)) out.push(...override);
        return out.length > 0 ? out : undefined;
    }
}
