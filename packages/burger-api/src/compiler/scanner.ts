import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { ROUTE_CONSTANTS } from '../utils/routing';
import { filePathToApiRoutePath } from '../utils/pathConversion';
import {
    CONVENTION_FILES,
    INHERITABLE_FILES,
    assertConventionFile,
    isConventionFile,
    type ConventionFile,
} from './conventions';
import type { GroupInheritanceSource, ScannedRoute } from './route-module';

/**
 * Walks a route directory tree and produces a pure inventory of route
 * directories — the first stage of the compiler pipeline
 * (`ROADMAP.md` §2.1 step 1).
 *
 * The scanner only enumerates files and computes route paths / inheritance
 * chains. It performs **no `import()`** of any module; loading module code is
 * the exclusive responsibility of the Module Loader. This keeps the filesystem
 * walk cheap, deterministic, and side-effect free.
 *
 * Convention rules enforced here (fail fast):
 * - Only recognized convention files are acknowledged; `middleware.ts` is forbidden.
 * - Dynamic (`[param]`) and wildcard (`[...]`) folders cannot be mixed at the
 *   same directory level, and there can be at most one of each per level.
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
     * Scans the tree and returns one {@link ScannedRoute} per directory that
     * contains a `route.ts`.
     * @throws on forbidden files or conflicting dynamic/wildcard folders.
     */
    async scan(): Promise<ScannedRoute[]> {
        const results: ScannedRoute[] = [];
        await this.walk(this.routesDir, [], results);
        return results;
    }

    /**
     * Recursively walks `dir`, tracking the chain of **group** folder names
     * (for inheritance) and emitting a `ScannedRoute` whenever a `route.ts`
     * is found.
     *
     * @param groupChain group folder names from root down to (but not
     *        including) the current directory.
     */
    private async walk(
        dir: string,
        groupChain: string[],
        out: ScannedRoute[]
    ): Promise<void> {
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

        // Gather this directory's convention files and build the inheritance
        // chain (group files are collected from every ancestor directory).
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
            const relativeFilePath = path.relative(this.routesDir, routeFilePath);
            const routePath = filePathToApiRoutePath(
                relativeFilePath,
                this.prefix
            );
            const groupFiles = await this.collectGroupFiles(dir, groupChain);
            out.push({
                routePath,
                routeDir: path.resolve(dir),
                localFiles,
                groupFiles,
                groupChain: [...groupChain],
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
            // Group folders do not affect the URL path but DO extend the
            // inheritance chain for descendants.
            const isGroup =
                name.startsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_START) &&
                name.endsWith(ROUTE_CONSTANTS.GROUPING_FOLDER_END);
            const childChain = isGroup
                ? [...groupChain, name]
                : groupChain;
            await this.walk(childPath, childChain, out);
        }
    }

    /**
     * Collects inheritable convention files from every ancestor group
     * directory, ordered root → nearest. Only `INHERITABLE_FILES`
     * (`schema`/`hooks`/`use`/`openapi`) participate in group inheritance;
     * `route.ts` and `webhook.ts` are route-local and never inherited.
     */
    private async collectGroupFiles(
        routeDir: string,
        groupChain: string[]
    ): Promise<GroupInheritanceSource[]> {
        const sources: GroupInheritanceSource[] = [];
        if (groupChain.length === 0) return sources;

        // `groupChain` holds folder names root → nearest. Walk from the root
        // (routesDir + first group) down to the nearest ancestor.
        let current = this.routesDir;
        for (const groupName of groupChain) {
            current = path.join(current, groupName);
            const files: Partial<Record<ConventionFile, string>> = {};
            let entries;
            try {
                entries = await readdir(current, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const entry of entries) {
                if (!entry.isFile()) continue;
                const stem = entry.name.replace(/\.ts$/, '');
                if (!isConventionFile(stem)) continue;
                assertConventionFile(stem);
                if (
                    (INHERITABLE_FILES as readonly string[]).includes(stem)
                ) {
                    files[stem] = path.resolve(path.join(current, entry.name));
                }
            }
            sources.push({ dir: path.resolve(current), files });
        }
        return sources;
    }
}

/** Re-exported for convenience / symmetry with the module loader. */
export { CONVENTION_FILES };
