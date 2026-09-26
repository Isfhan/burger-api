/**
 * Static asset serving for pages. Assets live under `<pageDir>/assets/` and
 * are served at `{pagePrefix}/assets/<relative-path>`.
 *
 * Dev (`pageDir` set) reads files from disk per request; production AOT
 * (`assetRoutes` from the CLI build) embeds base64 contents in the bundle.
 */

import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import type { RequestHandler } from '../types/index.js';
import { contentTypeFor } from './asset-mime.js';

export { ASSET_MIME, contentTypeFor } from './asset-mime.js';

/** A single static asset resolved from disk (dev mode). */
export interface DiskAssetRoute {
    /** Route path including the prefix (e.g. `/assets/style.css`). */
    routePath: string;
    /** Absolute file path on disk. */
    file: string;
    contentType: string;
}

/**
 * Recursively collects one route entry per file under `<pageDir>/assets/`;
 * returns `[]` when the directory does not exist.
 */
export async function collectDiskAssetRoutes(
    pageDir: string,
    prefix = ''
): Promise<DiskAssetRoute[]> {
    const assetsDir = path.resolve(pageDir, 'assets');
    let entries: import('node:fs').Dirent[];
    try {
        entries = (await readdir(assetsDir, {
            withFileTypes: true,
            recursive: true,
        })) as unknown as import('node:fs').Dirent[];
    } catch {
        return [];
    }

    const cleanPrefix = prefix.replace(/\/+$/, '');
    const routes: DiskAssetRoute[] = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        // `parentPath` carries the subdirectory path for nested files.
        const parent = (entry as { parentPath?: string }).parentPath ?? '';
        const relative = path.relative(
            assetsDir,
            path.join(parent, entry.name)
        );
        const normalized = relative.split(path.sep).join('/');
        routes.push({
            routePath: `${cleanPrefix}/assets/${normalized}`,
            file: path.join(assetsDir, relative),
            contentType: contentTypeFor(entry.name),
        });
    }
    return routes.sort((a, b) => a.routePath.localeCompare(b.routePath));
}

/**
 * Handler for a disk-backed asset: streams the file via `Bun.file` per request
 * so dev edits show without a restart. Fails loud when Bun is unavailable
 * instead of a bare "Bun is not defined".
 */
export function diskAssetHandler(route: DiskAssetRoute): RequestHandler {
    return async () => {
        if (typeof Bun === 'undefined') {
            throw new Error(
                `[burger-api] Disk-backed asset serving ("${route.routePath}") ` +
                    'requires Bun. Use `burger-api build` to embed assets ' +
                    'for other runtimes — see EmbeddedAsset / embeddedAssetHandler.'
            );
        }
        const file = Bun.file(route.file);
        if (!(await file.exists())) {
            return new Response('Asset not found', { status: 404 });
        }
        return new Response(file, {
            headers: { 'Content-Type': route.contentType },
        });
    };
}

// Embedded assets live in a module without `node:fs` (portable bundles).
export { embeddedAssetHandler } from './embedded-assets.js';
export type { EmbeddedAsset } from './embedded-assets.js';
