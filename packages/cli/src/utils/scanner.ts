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
import { detectExportedMethods, detectExportedHookNames } from './route-methods';
import { ROUTE_CONSTANTS } from './route-conventions';
import {
    filePathToApiRoutePath,
    filePathToPageRoutePath,
} from './route-conventions';

export interface ApiRouteScanEntry {
    /** Absolute import path used by generated build entry */
    importPath: string;
    /** Route path with prefix (e.g. /api/users/:id) */
    routePath: string;
    isWildcard: boolean;
    /** HTTP methods exported by the route module (set by method detection; omit = emit all) */
    methods?: string[];
    /** Absolute import path of a sibling `hooks.ts`, if the route declares lifecycle hooks (Phase 4). */
    hooksPath?: string;
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
    const absoluteApiDir = path.resolve(cwd, apiDir);
    if (!existsSync(absoluteApiDir)) {
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

            if (isDynamic && wildcardFolderFound) {
                throw new Error(
                    `Cannot mix dynamic and wildcard route folders. Found dynamic '${entry.name}' but wildcard already exists in '${dir}'.`
                );
            }
            if (isWildcard && dynamicFolderFound) {
                throw new Error(
                    `Cannot mix wildcard and dynamic route folders. Found wildcard '${entry.name}' but dynamic already exists in '${dir}'.`
                );
            }
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

        if (entry.isFile() && entry.name === 'route.ts') {
            const routePath = filePathToApiRoutePath(relativePath, prefix);
            const importPath = entryPath.split(path.sep).join('/');
            const methods = await detectExportedMethods(entryPath);
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
            // Capture a sibling `hooks.ts` so the build entry can wire
            // lifecycle hooks (Phase 4). Only when it actually exports hooks.
            const hooksFile = path.join(dir, 'hooks.ts');
            if (existsSync(hooksFile)) {
                const hookNames = await detectExportedHookNames(hooksFile);
                if (hookNames) {
                    scanEntry.hooksPath = hooksFile
                        .split(path.sep)
                        .join('/');
                }
            }
            out.push(scanEntry);
        }
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
    const absolutePageDir = path.resolve(cwd, pageDir);
    if (!existsSync(absolutePageDir)) {
        return [];
    }

    const entries: PageRouteScanEntry[] = [];
    await scanPageDir(absolutePageDir, '', pagePrefix, entries);
    return entries;
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
