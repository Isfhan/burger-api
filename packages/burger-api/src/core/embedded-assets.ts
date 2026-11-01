import type { RequestHandler } from '../types/index.js';

/**
 * Embedded (base64) static assets for production AOT builds. Kept apart from
 * `assets.ts` so portable bundles (`toFetchHandler`) never load `node:fs`.
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
 * Handler for an embedded asset: decodes the base64 payload once with the
 * Web-standard `atob` and serves the bytes.
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
