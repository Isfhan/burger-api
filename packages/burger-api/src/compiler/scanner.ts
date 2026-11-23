import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { ROUTE_CONSTANTS } from '../utils/routing.js';
import { filePathToApiRoutePath } from '../utils/pathConversion.js';
import { resolveScanDir } from '../utils/fs.js';
import {
    assertConventionFile,
    isConventionFile,
    splitConventionName,
    type ConventionFile,
} from './conventions.js';
import type { ScannedRoute, ScanResult } from './route-module.js';

/**
 * Walks a route directory tree and produces a pure inventory of route
 * directories — the first stage of the compiler pipeline.
 *
 * The scanner only enumerates files and computes route paths; it never calls
 * `import()` (that is the Module Loader's job), keeping the walk cheap,
 * deterministic, and side-effect free. Each route directory is
 * self-contained — no group inheritance chain; groups only strip URL paths.
 *
 * Fail-fast rules:
 * - Only recognized convention files are acknowledged; `middleware.ts` is forbidden.
 * - At most one dynamic (`[param]`) and one wildcard (`[...]`) folder per
 *   level (they may coexist; priority is static > param > wildcard).
 * - Named wildcard folders (`[...slug]`) are not supported yet.
 */
export class DirectoryScanner {
    constructor(
        private readonly routesDir: string,
        private readonly prefix: string = ''
    ) {
        if (!routesDir) {
            throw new Error('Routes directory path is required');
        }
        this.routesDir = resolveScanDir(routesDir, 'Routes', 'apiDir');
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
        // App-level convention files (hooks.ts, openapi.config.ts, plugins.ts,
        // providers.ts) are siblings of the entry point — the parent of the
        // routes directory.
        const appFiles = await collectAppConventionFiles(
            path.dirname(this.routesDir)
        );
        return { routes, ...appFiles };
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

        // Collect convention files per stem (`route`, `schema`, …) across
        // all accepted extensions (.ts/.js/.mjs).
        const conventionByStem: Map<string, string> = new Map();

        for (const entry of entries) {
            if (entry.isDirectory()) {
                subDirs.push(entry.name);
                continue;
            }
            if (!entry.isFile()) continue;
            const split = splitConventionName(entry.name);
            if (!split) continue;
            // Reject forbidden files (e.g. `middleware.ts`) regardless of
            // whether they are a recognized convention file.
            assertConventionFile(split.stem);
            // Non-convention files (helpers, fixtures) are ignored.
            if (!isConventionFile(split.stem)) continue;
            const abs = path.resolve(path.join(dir, entry.name));
            const existing = conventionByStem.get(split.stem);
            if (existing) {
                throw new Error(
                    `Conflicting convention files "${existing}" and "${abs}" in "${dir}" — ` +
                        `a route directory must not contain both ${split.stem}.ts and ${split.stem}.js (or .mjs).`
                );
            }
            conventionByStem.set(split.stem, abs);
        }

        // Validate folder-level conflicts.
        for (const name of subDirs) {
            // Named wildcard folders (`[...slug]`) become literal path
            // segments that can never match — fail loud instead of emitting
            // a dead route.
            if (
                name.startsWith(ROUTE_CONSTANTS.WILDCARD_START) &&
                name !== ROUTE_CONSTANTS.WILDCARD_SIMPLE
            ) {
                throw new Error(
                    `Named wildcard folder '${name}' is not supported — ` +
                        `use '${ROUTE_CONSTANTS.WILDCARD_SIMPLE}' (anonymous) instead.`
                );
            }
            assertUsableFolderName(name, dir);
            const isDynamic =
                name.startsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_START) &&
                name.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END) &&
                !name.startsWith(ROUTE_CONSTANTS.WILDCARD_START);
            const isWildcard = name === ROUTE_CONSTANTS.WILDCARD_SIMPLE;

            // Dynamic + wildcard siblings are legal — the trie resolves
            // them by priority (static > `:param` > `*`, with backtracking).
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

        for (const [stem, abs] of conventionByStem) {
            localFiles[stem as ConventionFile] = abs;
            if (stem === 'route') hasRoute = true;
        }

        if (hasRoute) {
            const routeFilePath = localFiles.route!;
            // Convert from the path *relative to* the scanned root so that the
            // absolute temp/working-directory prefix does not leak into the
            // route path.
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
        } else if (conventionByStem.size > 0) {
            // No `route.ts`, so every sibling convention file applies to
            // nothing — routes never inherit from parent folders.
            const relativeFolder = path
                .relative(this.routesDir, dir)
                .split(path.sep)
                .join('/');
            const fileNames = [...conventionByStem.values()]
                .map((file) => path.basename(file))
                .sort();
            console.warn(
                `[burger-api] ${relativeFolder || '.'} has ${fileNames.join(', ')} but no route.ts, so they apply to nothing. ` +
                    `Convention files are not inherited by child routes: put hooks.ts/config.ts next to each route.ts.`
            );
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

/**
 * Route folder labels allow every RFC 3986 path character except `(` `)` `[`
 * `]`, which stay reserved for the `(group)`, `[param]` and `[...]`
 * conventions. Anything else can never match (or crashes `Bun.serve`), so it
 * fails at startup instead of silently 404ing.
 */
const USABLE_FOLDER_CHARS = /^[A-Za-z0-9._~!$&'*+,;=:@-]+$/;

function assertUsableFolderName(name: string, dir: string): void {
    let label = name;
    if (name.length >= 2 && name[0] === '(' && name[name.length - 1] === ')') {
        label = name.slice(1, -1);
    } else if (
        name.length >= 2 &&
        name[0] === '[' &&
        name[name.length - 1] === ']'
    ) {
        label = name.slice(1, -1);
        if (label === '...') return; // anonymous wildcard
        if (label.startsWith('...')) label = label.slice(3);
    }
    if (label.length === 0 || !USABLE_FOLDER_CHARS.test(label)) {
        throw new Error(
            `Unusable route folder name '${name}' in '${dir}': use only letters, digits and - . _ ~ ! $ & ' * + , ; = : @ (spaces and non-ASCII characters can never match a request).`
        );
    }
}

/**
 * Discovers the app-level convention files (`hooks`, `openapi.config`,
 * `plugins`, `providers`) in `appRoot`. Conflicting extensions for one stem
 * fail loud.
 */
async function collectAppConventionFiles(
    appRoot: string
): Promise<
    Pick<
        ScanResult,
        'globalHooks' | 'openAPIConfigPath' | 'pluginsPath' | 'providersPath'
    >
> {
    let rootEntries: { name: string; isFile: () => boolean }[] = [];
    try {
        rootEntries = await readdir(appRoot, { withFileTypes: true });
    } catch {
        // Directory may not exist — ignore.
    }
    const rootFiles: Record<string, string> = {};
    for (const entry of rootEntries) {
        if (!entry.isFile()) continue;
        const split = splitConventionName(entry.name);
        if (!split) continue;
        const stem = split.stem;
        if (
            stem !== 'hooks' &&
            stem !== 'openapi.config' &&
            stem !== 'plugins' &&
            stem !== 'providers'
        ) {
            continue;
        }
        const existing = rootFiles[stem];
        if (existing) {
            throw new Error(
                `Conflicting app-level convention files "${existing}" and "${path.join(appRoot, entry.name)}" — ` +
                    `use only one of .ts/.js/.mjs per convention file.`
            );
        }
        rootFiles[stem] = path.resolve(path.join(appRoot, entry.name));
    }
    return {
        globalHooks: rootFiles['hooks'],
        openAPIConfigPath: rootFiles['openapi.config'],
        pluginsPath: rootFiles['plugins'],
        providersPath: rootFiles['providers'],
    };
}

/**
 * App-root convention files for apps with no API directory (pages-only).
 * Returns a route-less {@link ScanResult} so the Module Loader can load
 * hooks/plugins/providers exactly like it does for API apps.
 */
export async function scanAppRootConventions(
    appRoot: string
): Promise<ScanResult> {
    const appFiles = await collectAppConventionFiles(appRoot);
    return { routes: [], ...appFiles };
}

/** Re-exported for convenience / symmetry with the module loader. */
export { CONVENTION_FILES } from './conventions.js';
