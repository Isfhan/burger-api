/**
 * Static asset serving for pages.
 *
 * Assets live under `<pageDir>/assets/` and are served at
 * `{pagePrefix}/assets/<relative-path>` with a content-type derived from the
 * file extension.
 *
 * Two registration modes:
 * - **Dev** (`pageDir` set): files are read from disk per request, so edits
 *   show up without a restart.
 * - **Production AOT** (`assetRoutes` option from the CLI build): file
 *   contents are base64-embedded into the bundle by `burger-api build`, so
 *   bundles stay self-contained single files and never touch the filesystem.
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
 * Walks `<pageDir>/assets/` recursively and returns one route entry per
 * file. Returns an empty array when the assets directory does not exist.
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
 * Handler for a disk-backed asset: streams the file via `Bun.file` on every
 * request so dev edits are served without a restart.
 *
 * Dev-mode only in practice — `burger-api dev` always runs under Bun — but
 * `Bun` is undefined on every other runtime, so a guard here fails with a
 * clear message instead of a bare "Bun is not defined" if this handler is
 * ever reached outside Bun (e.g. `apiRoutes` built by hand for a non-Bun
 * target). Matches the guard pattern in `router/compiler.ts`.
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

/** A static asset with its contents base64-embedded (production AOT). */
export interface EmbeddedAsset {
    /** Route path including the prefix (e.g. `/assets/style.css`). */
    path: string;
    contentType: string;
    /** File contents encoded as standard base64. */
    data: string;
}

/**
 * Handler for an embedded asset: decodes the base64 payload per request.
 * Text assets decode as UTF-8; anything else is served as bytes.
 */
export function embeddedAssetHandler(asset: EmbeddedAsset): RequestHandler {
    const isText = asset.contentType.includes('text/') ||
        asset.contentType.startsWith('application/json') ||
        asset.contentType.startsWith('image/svg');
    return () => {
        const bytes = Buffer.from(asset.data, 'base64');
        if (isText) {
            return new Response(bytes.toString('utf-8'), {
                headers: { 'Content-Type': asset.contentType },
            });
        }
        return new Response(new Uint8Array(bytes), {
            headers: { 'Content-Type': asset.contentType },
        });
    };
}
