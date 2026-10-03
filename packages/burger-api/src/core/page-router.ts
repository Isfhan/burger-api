// Bun has no native recursive directory walker, so traversal uses Node's
// `fs/promises` via Bun's compatibility layer. `node:path` is only used for
// OS-agnostic path string joins.
import { readdir } from 'node:fs/promises';
import * as path from 'node:path';

// Import utils
import {
    cleanPrefix,
    normalizePath,
    compareRoutes,
    ROUTE_CONSTANTS,
} from '../utils/index.js';
import { resolveScanDir } from '../utils/fs.js';
import { filePathToPageRoutePath } from '../utils/pathConversion.js';

// Import types
import type { PageDefinition, RequestHandler } from '../types/index.js';

/**
 * File-based page router: loads pages from a directory tree, matches requests,
 * and supports dynamic segments (e.g. `[id]`). Default exports are handlers.
 */
export class PageRouter {
    /** Array of loaded page definitions */
    public pages: PageDefinition[] = [];

    /**
     * @param pagesDir Directory containing page modules.
     * @param prefix Optional prefix for every route (e.g. "pages" → "/pages/...").
     */
    constructor(
        private pagesDir: string,
        private prefix: string = ''
    ) {
        if (!pagesDir) {
            throw new Error('Pages directory path must be provided');
        }

        this.pagesDir = path.normalize(resolveScanDir(pagesDir, 'Pages', 'pageDir'));

        if (prefix) {
            this.prefix = cleanPrefix(prefix);
        }
    }

    /**
     * Loads and sorts page modules (static routes before dynamic ones).
     */
    public async loadPages(): Promise<void> {
        this.pages = [];
        try {
            await this.scanDirectory(this.pagesDir);
            this.pages.sort((a, b) => compareRoutes(a, b));
        } catch (error) {
            console.error('Failed to load pages:', error);
            throw new Error(
                `Failed to load pages: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    /**
     * Recursively scans `dir` for page modules.
     * @param dir Directory to scan.
     * @param basePath Base path used to build route paths.
     */
    private async scanDirectory(
        dir: string,
        basePath: string = ''
    ): Promise<void> {
        // Tracks whether a dynamic folder or file was already seen at this
        // level (two `[param]` entries would be ambiguous).
        let dynamicFolderFound = false;
        let dynamicFileFound = false;

        try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const entryPath = path.join(dir, entry.name);
                const relativePath = path.join(basePath, entry.name);

                if (entry.isDirectory()) {
                    // Named wildcard folders (`[...slug]`) can never match a
                    // page route — fail loud instead of silently dropping them.
                    if (
                        entry.name.startsWith(
                            ROUTE_CONSTANTS.WILDCARD_START
                        ) &&
                        entry.name !== ROUTE_CONSTANTS.WILDCARD_SIMPLE
                    ) {
                        throw new Error(
                            `Named wildcard folder '${entry.name}' is not supported — ` +
                                `use '${ROUTE_CONSTANTS.WILDCARD_SIMPLE}' (anonymous) instead.`
                        );
                    }
                    if (entry.name.startsWith(ROUTE_CONSTANTS.WILDCARD_START)) {
                        continue;
                    }

                    // Handle dynamic directories (e.g., [id])
                    if (
                        entry.name.startsWith(
                            ROUTE_CONSTANTS.DYNAMIC_FOLDER_START
                        ) &&
                        entry.name.endsWith(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END)
                    ) {
                        if (dynamicFolderFound) {
                            throw new Error(
                                `Multiple dynamic page folders found in the same directory: '${entry.name}' conflicts with another dynamic folder.`
                            );
                        }
                        dynamicFolderFound = true;
                    }
                    await this.scanDirectory(entryPath, relativePath);
                } else if (
                    entry.isFile() &&
                    ROUTE_CONSTANTS.SUPPORTED_PAGE_EXTENSIONS.some((ext) =>
                        entry.name.endsWith(ext)
                    )
                ) {
                    // Two dynamic files (`[a].tsx` + `[b].tsx`) at the same
                    // level are ambiguous — fail loud like dynamic folders.
                    if (
                        entry.name.startsWith(
                            ROUTE_CONSTANTS.DYNAMIC_FOLDER_START
                        ) &&
                        entry.name.includes(ROUTE_CONSTANTS.DYNAMIC_FOLDER_END)
                    ) {
                        if (dynamicFileFound) {
                            throw new Error(
                                `Multiple dynamic page files found in the same directory: '${entry.name}' conflicts with another dynamic file.`
                            );
                        }
                        dynamicFileFound = true;
                    }

                    // Convert file path to route path and load the module
                    const cleanedRoutePath = filePathToPageRoutePath(
                        relativePath,
                        this.prefix
                    );

                    // `.html` files are imported as raw markup — Bun's default
                    // `.html` import yields an HTMLBundle that would crash on
                    // `toFetchHandler`.
                    const isHtmlPage = entry.name.endsWith('.html');
                    const modulePath = path.resolve(
                        isHtmlPage ? entryPath + '?raw' : entryPath
                    );

                    const pageModule = await import(modulePath);

                    // `.tsx` pages export a function; `.html` pages export raw
                    // markup — wrap it so both Bun and WinterCG serve text/html.
                    let handler: RequestHandler;
                    if (typeof pageModule.default === 'function') {
                        handler = pageModule.default;
                    } else if (typeof pageModule.default === 'string') {
                        handler = () =>
                            new Response(pageModule.default, {
                                headers: {
                                    'Content-Type':
                                        'text/html; charset=utf-8',
                                },
                            });
                    } else {
                        throw new Error(
                            `Page at ${entryPath} must export a default function or an HTML string as its handler.`
                        );
                    }

                    const pageDef: PageDefinition = {
                        path: cleanedRoutePath,
                        handler,
                        source: entryPath,
                    };
                    this.pages.push(pageDef);
                    // Non-root pages also answer the trailing-slash variant.
                    // The root already ends in `/` — adding another would
                    // create the odd `//` route key.
                    if (
                        cleanedRoutePath !== '/' &&
                        !cleanedRoutePath.endsWith('/')
                    ) {
                        this.pages.push({
                            path: cleanedRoutePath + '/',
                            handler,
                            source: entryPath,
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dir}:`, error);
            throw error;
        }
    }

    /**
     * Finds the page matching the request and extracts dynamic params.
     * @param request The request to resolve.
     * @returns The matched page + params, or empty params when nothing matches.
     */
    public resolve(request: Request): {
        page?: PageDefinition;
        params: Record<string, string>;
    } {
        const url = new URL(request.url);
        const reqPath = normalizePath(url.pathname);

        console.debug(`Resolving route for path: ${reqPath}`);

        for (const page of this.pages) {
            const match = this.matchRoute(reqPath, page.path);
            if (match) {
                console.debug(
                    `Route matched: ${page.path} with params:`,
                    match
                );
                return { page, params: match };
            }
        }

        console.debug(`No matching route found for path: ${reqPath}`);
        return { params: {} };
    }

    /**
     * Matches a request path against a page path.
     * @param requestPath The request path to check.
     * @param pagePath The page path to match against.
     * @returns Captured params when matched, otherwise null.
     */
    private matchRoute(
        requestPath: string,
        pagePath: string
    ): Record<string, string> | null {
        const reqSegments = requestPath.split('/').filter(Boolean);
        const pageSegments = pagePath.split('/').filter(Boolean);

        if (reqSegments.length !== pageSegments.length) {
            return null;
        }

        const params: Record<string, string> = {};
        for (let i = 0; i < reqSegments.length; i++) {
            const pSegment = pageSegments[i]!;
            const reqSegment = reqSegments[i]!;

            if (pSegment.startsWith(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX)) {
                const paramName = pSegment.slice(
                    ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX.length
                );
                // Percent-decode the captured value; fall back to the raw
                // segment on malformed encoding.
                try {
                    params[paramName] = decodeURIComponent(reqSegment);
                } catch {
                    params[paramName] = reqSegment;
                }
            } else if (pSegment !== reqSegment) {
                return null;
            }
        }
        return params;
    }
}
