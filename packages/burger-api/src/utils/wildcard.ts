/**
 * Extracts the pathname from a full URL string, removing query parameters and
 * fragments.
 * @param url - The full URL string (e.g., "http://localhost:4000/api/users/123/profile?id=1")
 * @returns The extracted pathname (e.g., "/api/users/123/profile")
 */
export function extractPathnameFromUrl(url: string): string {
    // Find where the path starts (after protocol and domain)
    // Example: "http://localhost:4000/api/..." → protocolEnd = 4 (after "http")
    const protocolEnd = url.indexOf('://');

    // Find first "/" after the domain
    // Example: "http://localhost:4000/api/..." → pathStart = 21 (the "/" before "api")
    const pathStart = url.indexOf('/', protocolEnd + 3);

    // Single scan for the terminator. `#` is included for parity with
    // `new Request(url).url` inputs (the URL parser strips fragments, but
    // callers may hand us a raw URL string) — mirrors Hono's `getPath`
    // (`dist/utils/url.js`).
    for (let i = pathStart < 0 ? 0 : pathStart; i < url.length; i++) {
        const code = url.charCodeAt(i);
        if (code === 63 /* ? */ || code === 35 /* # */) {
            return url.substring(pathStart, i);
        }
    }
    // No query params / fragment. `substring` clamps a negative `pathStart`
    // to 0, preserving the historical fallback for URL strings without a
    // path segment.
    return url.substring(pathStart);
}
