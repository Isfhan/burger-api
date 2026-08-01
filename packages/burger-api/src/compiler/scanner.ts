import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { ROUTE_CONSTANTS } from '../utils/routing';
import { filePathToApiRoutePath } from '../utils/pathConversion';
import {
    assertConventionFile,
    isConventionFile,
    type ConventionFile,
} from './conventions';
import type { ScannedRoute, ScanResult } from './route-module';

/**
 * Walks a route directory tree and produces a pure inventory of route
 * directories — the first stage of the compiler pipeline
 * (`ROADMAP.md` §2.1 step 1).
 *
 * The scanner only enumerates files and computes route paths. It performs
 * **no `import()`** of any module; loading module code is the exclusive
 * responsibility of the Module Loader. This keeps the filesystem walk
 * cheap, deterministic, and side-effect free.
 *
 * Each route directory is **self-contained** — no group inheritance chain.
 * Groups only affect URL path stripping.
 *
 * Convention rules enforced here (fail fast):
 * - Only recognized convention files are acknowledged; `middleware.ts` is forbidden.
 * - Dynamic (`[param]`) and wildcard (`[...]`) folders cannot be mixed at the
 * same directory level, and there can be at most one of each per level.
 * - Named wildcard folders (`[...slug]`) are skipped (not yet supported).
 */
export class DirectoryScanner {
    constructor(
        private readonly routesDir: string,
        private readonly prefix: string = ''
    ) {
        if (!routesDir) {
            throw new Error('Routes directory path is required');
        }
    }

    /**
     * Scans the tree and returns a {@link ScanResult} containing:
     * - `routes`: one {@link ScannedRoute} per directory that contains a `route.ts`
     * - `globalHooks`: path to `hooks.ts` at the root of the routes directory (if any)
     * @throws on forbidden files or conflicting dynamic/wildcard folders.
     */
    async scan(): Promise<ScanResult> {
        const routes: ScannedRoute[] = [];
        await this.walk(this.routesDir, routes);

        // Detect global hooks, openapi.config.ts, plugins.ts, and providers.ts at the app root
        // (sibling of entry point).
        // When apiDir is `./src/api`, these live in `./src/`.
        // When apiDir is `./api`, these live in `./`.
        let globalHooks: string | undefined;
        let openAPIConfigPath: string | undefined;
        let pluginsPath: string | undefined;
        let providersPath: string | undefined;
        try {
            const parentDir = path.dirname(this.routesDir);
            const rootEntries = await readdir(parentDir, {
                withFileTypes: true,
            });
            for (const entry of rootEntries) {
                if (!entry.isFile()) continue;
                if (entry.name === 'hooks.ts') {
                    globalHooks = path.resolve(
                        path.join(parentDir, entry.name)
                    );
                }
                if (entry.name === 'openapi.config.ts') {
                    openAPIConfigPath = path.resolve(
                        path.join(parentDir, entry.name)
                    );
                }
                if (entry.name === 'plugins.ts') {
                    pluginsPath = path.resolve(
                        path.join(parentDir, entry.name)
                    );
                }
                if (entry.name === 'providers.ts') {
                    providersPath = path.resolve(
                        path.join(parentDir, entry.name)
                    );
                }
                if (
                    globalHooks &&
                    openAPIConfigPath &&
                    pluginsPath &&
                    providersPath
                )
                    break;
            }
        } catch {
            // Parent directory may not exist — ignore.
        }

        return {
            routes,
            globalHooks,
            openAPIConfigPath,
            pluginsPath,
            providersPath,
        };
    }

    /**
     * Recursively walks `dir` and emits a `ScannedRoute` whenever a `route.ts`
     * is found. Group folders `(name)` are traversed for URL stripping but
     * do NOT build an inheritance chain.
     */
    private async walk(dir: string, out: ScannedRoute[]): Promise<void> {
        let dynamicFolderFound = false;
        let wildcardFolderFound = false;

        const entries = await readdir(dir, { withFileTypes: true });

        // Separate files from subdirectories so we can validate folder
        // conflicts before recursing.
        const subDirs: string[] = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                subDirs.push(entry.name);
                continue;
            }
            if (!entry.isFile()) continue;
            if (!entry.name.endsWith('.ts')) continue;

            const stem = entry.name.replace(/\.ts$/, '');
            // Reject forbidden files (e.g. `middleware.ts`) regardless of
            // whether they are a recognized convention file.
            assertConventionFile(stem);
            // Non-convention `.ts` files (helpers, fixtures) are ignored.
            if (!isConventionFile(stem)) continue;
        }

        // Validate folder-level conflicts (ported from core/api-router.ts).
        for (const name of subDirs) {
            const isDynamic =
                name.startsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_START) &&
                name.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END) &&
                !name.startsWith(ROUTE_CONSTANTS.WILDCARD_START);
            const isWildcard = name === ROUTE_CONSTANTS.WILDCARD_SIMPLE;

            if (isDynamic && wildcardFolderFound) {
                throw new Error(
                    `Cannot mix dynamic and wildcard route folders in the same directory. ` +
                        `Found dynamic folder '${name}' but wildcard folder already exists in '${dir}'.`
                );
            }
            if (isWildcard && dynamicFolderFound) {
                throw new Error(
                    `Cannot mix wildcard and dynamic route folders in the same directory. ` +
                        `Found wildcard folder '${name}' but dynamic folder already exists in '${dir}'.`
                );
            }
            if (isDynamic && dynamicFolderFound) {
                throw new Error(
                    `Multiple dynamic route folders found in the same directory: ` +
                        `'${name}' conflicts with another dynamic folder in '${dir}'.`
                );
            }
            if (isWildcard && wildcardFolderFound) {
                throw new Error(
                    `Multiple wildcard route folders found in the same directory: ` +
                        `'${name}' conflicts with another wildcard folder in '${dir}'.`
                );
            }
            if (isDynamic) dynamicFolderFound = true;
            if (isWildcard) wildcardFolderFound = true;
        }

        // Gather this directory's convention files.
        const localFiles: Partial<Record<ConventionFile, string>> = {};
        let hasRoute = false;

        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const stem = entry.name.replace(/\.ts$/, '');
            if (!isConventionFile(stem)) continue;
            const abs = path.resolve(path.join(dir, entry.name));
            localFiles[stem] = abs;
            if (stem === 'route') hasRoute = true;
        }

        if (hasRoute) {
            const routeFilePath = localFiles.route!;
            // Convert from the path *relative to* the scanned root so that the
            // absolute temp/working-directory prefix does not leak into the
            // route path (mirrors core/api-router.ts, which used the relative
            // path for this conversion).
            const relativeFilePath = path.relative(
                this.routesDir,
                routeFilePath
            );
            const routePath = filePathToApiRoutePath(
                relativeFilePath,
                this.prefix
            );
            out.push({
                routePath,
                routeDir: path.resolve(dir),
                localFiles,
                isWildcard: routePath.includes(
                    ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX
                ),
            });
        }

        // Recurse into subdirectories.
        for (const name of subDirs) {
            const childPath = path.join(dir, name);
            // Named wildcard folders (`[...slug]`) are skipped for now.
            if (
                name.startsWith(ROUTE_CONSTANTS.WILDCARD_START) &&
                name !== ROUTE_CONSTANTS.WILDCARD_SIMPLE
            ) {
                continue;
            }
            await this.walk(childPath, out);
        }
    }
}

/** Re-exported for convenience / symmetry with the module loader. */
export { CONVENTION_FILES } from './conventions';
