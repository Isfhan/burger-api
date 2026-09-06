/**
 * Extension → Content-Type lookup for static assets. Split out from
 * `assets.ts` (which also does disk scanning via `node:fs`/`node:path`) so
 * the package's main entry — which statically re-exports `contentTypeFor`
 * for consumers like the CLI's build-time asset scanner — never pulls a
 * Node builtin into its static import graph. AOT/WinterCG deployments
 * never touch disk scanning, but they do call `contentTypeFor()`.
 */

/** Extension → Content-Type map for supported static assets. */
export const ASSET_MIME: Record<string, string> = {
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    json: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    html: 'text/html; charset=utf-8',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    pdf: 'application/pdf',
    wasm: 'application/wasm',
};

/** Resolves the content type for an asset path (defaults to octet-stream). */
export function contentTypeFor(filePath: string): string {
    const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
    return ASSET_MIME[ext] ?? 'application/octet-stream';
}
