import type { RequestHandler } from '../types/index.js';

/**
 * Embedded (base64) static assets for production AOT builds. Kept apart from
 * `assets.ts` (which reads the disk in dev) so runtime-portable bundles —
 * `toFetchHandler()` on Workers / Deno / Vercel / Node — never load
 * `node:fs`.
 */

/** A static asset with its contents base64-embedded (production AOT). */
export interface EmbeddedAsset {
    /** Route path including the prefix (e.g. `/assets/style.css`). */
    path: string;
    contentType: string;
    /** File contents encoded as standard base64. */
    data: string;
}

/**
 * Handler for an embedded asset. The base64 payload is decoded once (with
 * the Web-standard `atob`, so no `Buffer` dependency) and served as bytes.
 */
export function embeddedAssetHandler(asset: EmbeddedAsset): RequestHandler {
    const binary = atob(asset.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return () =>
        new Response(bytes, {
            headers: { 'Content-Type': asset.contentType },
        });
}
