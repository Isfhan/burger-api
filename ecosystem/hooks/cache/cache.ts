import type { BurgerContext, BurgerNext } from 'burger-api';

/**
 * Configuration options for the cache control hook.
 */
export interface CacheControlOptions {
    /**
     * Cache control directive.
     * @default 'no-cache'
     */
    directive?:
        | 'public'
        | 'private'
        | 'no-cache'
        | 'no-store'
        | 'must-revalidate';

    /**
     * Max age in seconds for cache.
     * @default undefined
     */
    maxAge?: number;

    /**
     * S-maxage in seconds for shared caches (CDNs).
     * @default undefined
     */
    sMaxAge?: number;

    /**
     * Must revalidate after becoming stale.
     * @default false
     */
    mustRevalidate?: boolean;

    /**
     * Proxy revalidate.
     * @default false
     */
    proxyRevalidate?: boolean;

    /**
     * Immutable - content will never change.
     * @default false
     */
    immutable?: boolean;

    /**
     * No transform - intermediaries shouldn't modify the response.
     * @default false
     */
    noTransform?: boolean;

    /**
     * Custom Cache-Control value. If provided, overrides other options.
     * @default undefined
     */
    custom?: string;

    /**
     * Add ETag header for conditional requests.
     * @default false
     */
    etag?: boolean;

    /**
     * Add Vary header to specify cache key factors.
     * @default undefined
     */
    vary?: string | string[];
}

/**
 * Creates a cache control hook for HTTP caching.
 *
 * This hook sets Cache-Control and related headers to control how responses
 * are cached by browsers, CDNs, and proxy servers.
 *
 * @param options - Configuration options for cache control
 * @returns A hook function that adds cache headers to responses
 *
 * @example
 * ```typescript
 * // No caching (default)
 * const noCache = cacheControl();
 *
 * // Cache for 1 hour
 * const cache1Hour = cacheControl({
 *   directive: 'public',
 *   maxAge: 3600
 * });
 *
 * // Private cache with revalidation
 * const privateCache = cacheControl({
 *   directive: 'private',
 *   maxAge: 300,
 *   mustRevalidate: true
 * });
 *
 * // Immutable assets
 * const immutableCache = cacheControl({
 *   directive: 'public',
 *   maxAge: 31536000, // 1 year
 *   immutable: true
 * });
 * ```
 */
export function cacheControl(options: CacheControlOptions = {}): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    const {
        directive = 'no-cache',
        maxAge,
        sMaxAge,
        mustRevalidate = false,
        proxyRevalidate = false,
        immutable = false,
        noTransform = false,
        custom,
        etag = false,
        vary,
    } = options;

    return (_ctx: BurgerContext): BurgerNext => {
        // Transform response to add cache headers
        return async (response: Response): Promise<Response> => {
            const headers = new Headers(response.headers);

            // Build Cache-Control header
            let cacheControlValue: string;

            if (custom) {
                // Use custom value if provided
                cacheControlValue = custom;
            } else {
                // Build from options
                const parts: string[] = [directive];

                if (maxAge !== undefined) {
                    parts.push(`max-age=${maxAge}`);
                }

                if (sMaxAge !== undefined) {
                    parts.push(`s-maxage=${sMaxAge}`);
                }

                if (mustRevalidate) {
                    parts.push('must-revalidate');
                }

                if (proxyRevalidate) {
                    parts.push('proxy-revalidate');
                }

                if (immutable) {
                    parts.push('immutable');
                }

                if (noTransform) {
                    parts.push('no-transform');
                }

                cacheControlValue = parts.join(', ');
            }

            headers.set('Cache-Control', cacheControlValue);

            // Add ETag if enabled
            if (etag) {
                const body = await response.text();
                const hash = await generateETag(body);
                headers.set('ETag', `"${hash}"`);

                // Recreate response with body
                return new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                });
            }

            // Add Vary header if specified
            if (vary) {
                const varyValue = Array.isArray(vary) ? vary.join(', ') : vary;
                headers.set('Vary', varyValue);
            }

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        };
    };
}

/**
 * Preset: No caching (default, secure)
 */
export function noCache(): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    return cacheControl({
        directive: 'no-store',
        custom: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    });
}

/**
 * Preset: Public cache with configurable max-age
 */
export function publicCache(maxAge: number = 3600): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    return cacheControl({
        directive: 'public',
        maxAge,
    });
}

/**
 * Preset: Private cache (for user-specific data)
 */
export function privateCache(maxAge: number = 300): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    return cacheControl({
        directive: 'private',
        maxAge,
        mustRevalidate: true,
    });
}

/**
 * Preset: Immutable cache (for static assets with fingerprints)
 */
export function immutableCache(): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    return cacheControl({
        directive: 'public',
        maxAge: 31536000, // 1 year
        immutable: true,
    });
}

/**
 * Preset: CDN cache with different browser/CDN durations
 */
export function cdnCache(browserMaxAge: number = 300, cdnMaxAge: number = 3600): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    return cacheControl({
        directive: 'public',
        maxAge: browserMaxAge,
        sMaxAge: cdnMaxAge,
        mustRevalidate: true,
    });
}

/**
 * Generate ETag hash from content.
 */
async function generateETag(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16); // Use first 16 characters
}

