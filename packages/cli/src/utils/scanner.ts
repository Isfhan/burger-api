/**
 * Build-time route scanner. Discovers route.ts and page files without loading modules.
 * Path conversion rules match the framework (scanner, module-loader).
 *
 * Vision: each route directory is self-contained — no group inheritance.
 * Groups only affect URL path stripping.
 */

import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import {
    detectExportedMethods,
    detectExportedHookNames,
} from './route-methods';
import { ROUTE_CONSTANTS, splitConventionName } from './route-conventions';
import {
    filePathToApiRoutePath,
    filePathToPageRoutePath,
} from './route-conventions';
import { CONVENTION_DEFAULTS } from './config';
import { contentTypeFor } from 'burger-api';

/**
 * Ensure BURGER_API_APP_DIR is set for in-process CLI scanning: from the
 * entry file when given (dirname of `src/index.ts` = `src/`), else `<cwd>/src`
 * when a `src/index.*` exists. This powers the entry-relative fallback so
 * `apiDir: 'api'` in burger.build.ts resolves to `src/api`, matching dev.
 */
export function ensureAppDirEnv(entryFile?: string): void {
    if (process.env.BURGER_API_APP_DIR) return;
    if (entryFile) {
        process.env.BURGER_API_APP_DIR = path.dirname(path.resolve(entryFile));
        return;
    }
    if (existsSync('src/index.ts') || existsSync('src/index.js')) {
        process.env.BURGER_API_APP_DIR = path.resolve('src');
    }
}

/**
 * Resolve a scan dir for CLI scans: project root first, then the entry
 * file's directory (BURGER_API_APP_DIR). Mirrors the framework's
 * `resolveScanDir`. Returns undefined when neither candidate exists.
 */
function resolveScanDir(cwd: string, dir: string): string | undefined {
    const cwdAbs = path.resolve(cwd, dir);
    if (existsSync(cwdAbs)) return cwdAbs;
    const appDir = process.env.BURGER_API_APP_DIR;
    if (appDir) {
        const srcAbs = path.resolve(appDir, dir);
        if (existsSync(srcAbs)) return srcAbs;
    }
    return undefined;
}

/**
 * Resolve a scan dir with a dynamic missing-dir error. Convention-default
 * paths stay silent when missing (e.g. a pages-only app has no `./src/api`);
 * custom paths fail loud so a typo'd apiDir never silently drops routes.
 */
function resolveScanDirOrThrow(
    cwd: string,
    dir: string,
    label: string,
    option: string,
    fallbackDefault: string
): string | undefined {
    const resolved = resolveScanDir(cwd, dir);
    if (resolved || dir === fallbackDefault) return resolved;
    const appDir = process.env.BURGER_API_APP_DIR;
    const shown = dir.replace(/^\.\//, '');
    const srcShown = appDir
        ? `"./${path.relative(cwd, path.resolve(appDir, dir)).split(path.sep).join('/')}"`
        : `"./src/${shown}"`;
    throw new Error(
        `${label} directory "${dir}" does not exist. Tried "./${shown}" (project root) and ${srcShown} (src/). ` +
            `Check the ${option} option in burger.build.ts.`
    );
}

/**
 * Returns the first existing convention file for `stem` in `dir`
 * (`route.ts`, `route.js`, `route.mjs` …). Throws when more than one
 * variant exists (fail loud — mirrors the framework scanner).
 */
function findConventionFile(
    dir: string,
    stem: string
): string | undefined {
    let found: string | undefined;
    for (const ext of ROUTE_CONSTANTS.CONVENTION_EXTENSIONS) {
        const candidate = path.join(dir, `${stem}${ext}`);
        if (!existsSync(candidate)) continue;
        if (found) {
            throw new Error(
                `Conflicting convention files "${found}" and "${candidate}" in "${dir}" — ` +
                    `a route directory must not contain both ${stem}.ts and ${stem}.js (or .mjs).`
            );
        }
        found = candidate;
    }
    return found;
}

export interface ApiRouteScanEntry {
    /** Absolute import path used by generated build entry */
    importPath: string;
    /** Route path with prefix (e.g. /api/users/:id) */
    routePath: string;
    isWildcard: boolean;
    /** HTTP methods exported by the route module (set by method detection; omit = emit all) */
    methods?: string[];
    /** Absolute import path of a sibling hooks file (`hooks.ts|.js|.mjs`), if the route declares lifecycle hooks. */
    hooksPath?: string;
    /** Absolute import path of a sibling `schema.*`, if present. */
    schemaPath?: string;
    /** Absolute import path of a sibling `openapi.*`, if present. */
    openapiPath?: string;
    /** Absolute import path of a sibling `config.*`, if present. */
    configPath?: string;
}

export interface PageRouteScanEntry {
    /** Absolute import path used by generated build entry */
    importPath: string;
    routePath: string;
}

/**
 * Scan apiDir for route.ts files and return entries for codegen.
 * Uses same path/convention rules as framework DirectoryScanner.
 *
 * Each route directory is self-contained — no global tier detection.
 * Groups only affect URL path stripping.
 */
export async function scanApiRoutes(
    cwd: string,
    apiDir: string,
    apiPrefix: string
): Promise<ApiRouteScanEntry[]> {
    const absoluteApiDir = resolveScanDirOrThrow(
        cwd,
        apiDir,
        'Routes',
        'apiDir',
        CONVENTION_DEFAULTS.apiDir
    );
    if (!absoluteApiDir) {
        return [];
    }

    const entries: ApiRouteScanEntry[] = [];
    await scanApiDir(absoluteApiDir, '', apiPrefix, entries);
    return entries;
}

async function scanApiDir(
    dir: string,
    basePath: string,
    prefix: string,
    out: ApiRouteScanEntry[]
): Promise<void> {
    let dynamicFolderFound = false;
    let wildcardFolderFound = false;

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);

        if (entry.isDirectory()) {
            if (
                entry.name.startsWith(ROUTE_CONSTANTS.WILDCARD_START) &&
                entry.name !== ROUTE_CONSTANTS.WILDCARD_SIMPLE
            ) {
                continue;
            }

            const isDynamic =
                entry.name.startsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_START) &&
                entry.name.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END) &&
                !entry.name.startsWith(ROUTE_CONSTANTS.WILDCARD_START);
            const isWildcard = entry.name === ROUTE_CONSTANTS.WILDCARD_SIMPLE;

            // Dynamic and wildcard folders may coexist at the same level —
            // the router's trie resolves them by priority
            // (static > `:param` > `*`), mirroring the framework scanner.
            if (isDynamic && dynamicFolderFound) {
                throw new Error(
                    `Multiple dynamic route folders in same directory: '${entry.name}' in '${dir}'.`
                );
            }
            if (isWildcard && wildcardFolderFound) {
                throw new Error(
                    `Multiple wildcard route folders in same directory: '${entry.name}' in '${dir}'.`
                );
            }
            if (isDynamic) dynamicFolderFound = true;
            if (isWildcard) wildcardFolderFound = true;

            await scanApiDir(entryPath, relativePath, prefix, out);
            continue;
        }

        if (!entry.isFile()) continue;
    }

    // Convention files are resolved per directory (once) across all
    // accepted extensions (.ts/.js/.mjs).
    const routeFile = findConventionFile(dir, 'route');
    if (routeFile) {
        const routePath = filePathToApiRoutePath(
            path.join(basePath, path.basename(routeFile)),
            prefix
        );
        const importPath = routeFile.split(path.sep).join('/');
        const methods = await detectExportedMethods(routeFile);
        const scanEntry: ApiRouteScanEntry = {
            importPath,
            routePath,
            isWildcard: routePath.includes(
                ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX
            ),
        };
        if (methods !== undefined) {
            scanEntry.methods = methods;
        }
        // Capture a sibling hooks file so the build entry can wire
        // lifecycle hooks. Only when it actually exports hooks.
        const hooksFile = findConventionFile(dir, 'hooks');
        if (hooksFile) {
            const hookNames = await detectExportedHookNames(hooksFile);
            if (hookNames) {
                scanEntry.hooksPath = hooksFile
                    .split(path.sep)
                    .join('/');
            }
        }
        // Capture sibling convention files for build entry merging
        const schemaFile = findConventionFile(dir, 'schema');
        if (schemaFile) {
            scanEntry.schemaPath = schemaFile.split(path.sep).join('/');
        }
        const openapiFile = findConventionFile(dir, 'openapi');
        if (openapiFile) {
            scanEntry.openapiPath = openapiFile.split(path.sep).join('/');
        }
        const configFile = findConventionFile(dir, 'config');
        if (configFile) {
            scanEntry.configPath = configFile.split(path.sep).join('/');
        }
        out.push(scanEntry);
    }
}

/**
 * Scan pageDir for .tsx and .html pages and return entries for codegen.
 */
export async function scanPageRoutes(
    cwd: string,
    pageDir: string,
    pagePrefix: string
): Promise<PageRouteScanEntry[]> {
    const absolutePageDir = resolveScanDirOrThrow(
        cwd,
        pageDir,
        'Pages',
        'pageDir',
        CONVENTION_DEFAULTS.pageDir
    );
    if (!absolutePageDir) {
        return [];
    }

    const entries: PageRouteScanEntry[] = [];
    await scanPageDir(absolutePageDir, '', pagePrefix, entries);
    return entries;
}

/** A static asset resolved for embedding into the production bundle. */
export interface AssetRouteScanEntry {
    /** Route path including the prefix (e.g. `/assets/style.css`). */
    routePath: string;
    /** Content-Type derived from the file extension. */
    contentType: string;
    /** Absolute file path — read and base64-embedded at build time. */
    absolutePath: string;
}

/**
 * Scan `<pageDir>/assets/` recursively for static files to embed into the
 * production bundle. Returns an empty array when no assets dir exists.
 */
export async function scanAssetRoutes(
    cwd: string,
    pageDir: string,
    pagePrefix: string
): Promise<AssetRouteScanEntry[]> {
    const absolutePageDir = resolveScanDirOrThrow(
        cwd,
        pageDir,
        'Pages',
        'pageDir',
        CONVENTION_DEFAULTS.pageDir
    );
    if (!absolutePageDir) return [];

    const assetsDir = path.join(absolutePageDir, 'assets');
    let entries;
    try {
        entries = await readdir(assetsDir, {
            withFileTypes: true,
            recursive: true,
        });
    } catch {
        return [];
    }

    const cleanPrefix = pagePrefix ? `/${pagePrefix.replace(/^\/+|\/+$/g, '')}` : '';
    const out: AssetRouteScanEntry[] = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const parent =
            (entry as unknown as { parentPath?: string }).parentPath ?? '';
        const relative = path.relative(
            assetsDir,
            path.join(parent, entry.name)
        );
        const normalized = relative.split(path.sep).join('/');
        out.push({
            routePath: `${cleanPrefix}/assets/${normalized}`,
            contentType: contentTypeFor(entry.name),
            absolutePath: path.join(assetsDir, relative),
        });
    }
    return out.sort((a, b) => a.routePath.localeCompare(b.routePath));
}

async function scanPageDir(
    dir: string,
    basePath: string,
    prefix: string,
    out: PageRouteScanEntry[]
): Promise<void> {
    let dynamicFolderFound = false;

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);

        if (entry.isDirectory()) {
            if (entry.name.startsWith(ROUTE_CONSTANTS.WILDCARD_START)) {
                continue;
            }

            const isDynamic =
                entry.name.startsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_START) &&
                entry.name.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END);
            if (isDynamic && dynamicFolderFound) {
                throw new Error(
                    `Multiple dynamic page folders in same directory: '${entry.name}' in '${dir}'.`
                );
            }
            if (isDynamic) dynamicFolderFound = true;
            await scanPageDir(entryPath, relativePath, prefix, out);
            continue;
        }

        if (
            entry.isFile() &&
            ROUTE_CONSTANTS.SUPPORTED_PAGE_EXTENSIONS.some((ext) =>
                entry.name.endsWith(ext)
            )
        ) {
            const routePath = filePathToPageRoutePath(relativePath, prefix);
            const importPath = entryPath.split(path.sep).join('/');
            out.push({ importPath, routePath });
        }
    }
}

// ─────────────────────────────────────────────────────
// WebSocket route scanner
// ─────────────────────────────────────────────────────

export interface WebSocketRouteScanEntry {
    /** Absolute import path used by generated build entry */
    importPath: string;
    /** Route path with prefix (e.g. /ws/chat) */
    routePath: string;
    /** Absolute import path of a sibling `hooks.ts`, if present */
    hooksPath?: string;
    /** Absolute import path of a sibling `config.ts`, if present */
    configPath?: string;
}

/**
 * Scan wsDir for ws.ts files and return entries for inspect.
 */
export async function scanWebSocketRoutes(
    cwd: string,
    wsDir: string
): Promise<WebSocketRouteScanEntry[]> {
    const absoluteWsDir = resolveScanDirOrThrow(
        cwd,
        wsDir,
        'WebSocket',
        'wsDir',
        CONVENTION_DEFAULTS.wsDir ?? ''
    );
    if (!absoluteWsDir) {
        return [];
    }

    const entries: WebSocketRouteScanEntry[] = [];
    await scanWsDir(absoluteWsDir, '', entries);
    return entries;
}

async function scanWsDir(
    dir: string,
    basePath: string,
    out: WebSocketRouteScanEntry[]
): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);

        if (entry.isDirectory()) {
            await scanWsDir(entryPath, relativePath, out);
            continue;
        }
    }

    const wsFile = findConventionFile(dir, 'ws');
    if (wsFile) {
        const importPath = wsFile.split(path.sep).join('/');

        // Build route path from directory structure
        const routePath = buildWsRoutePath(basePath);

        const scanEntry: WebSocketRouteScanEntry = {
            importPath,
            routePath,
        };

        // Check for sibling hooks/config
        const hooksFile = findConventionFile(dir, 'hooks');
        if (hooksFile) {
            scanEntry.hooksPath = hooksFile.split(path.sep).join('/');
        }
        const configFile = findConventionFile(dir, 'config');
        if (configFile) {
            scanEntry.configPath = configFile.split(path.sep).join('/');
        }

        out.push(scanEntry);
    }
}

/**
 * Build WebSocket route path from directory structure.
 * Handles dynamic [param] and group (name) directories.
 */
function buildWsRoutePath(relativePath: string): string {
    if (!relativePath) return '/';

    const parts = relativePath.split(path.sep);
    const routeParts: string[] = [];

    for (const part of parts) {
        // Skip group directories (URL only)
        if (/^\(.+\)$/.test(part)) continue;

        // Convert wildcard [...]
        if (/^\[\.\.\.([^\]]*)\]$/.test(part)) {
            routeParts.push('*');
            continue;
        }

        // Convert dynamic [param]
        const dynamicMatch = part.match(/^\[([^\]]+)\]$/);
        if (dynamicMatch) {
            routeParts.push(`:${dynamicMatch[1]}`);
            continue;
        }

        routeParts.push(part);
    }

    return '/' + routeParts.join('/');
}
