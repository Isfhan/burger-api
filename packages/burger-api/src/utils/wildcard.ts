/**
 * Extracts the pathname from a full URL string, removing query parameters and
 * fragments.
 * @param url - The full URL string (e.g., "http://localhost:4000/api/users/123/profile?id=1")
 * @returns The extracted pathname (e.g., "/api/users/123/profile")
 */
export function extractPathnameFromUrl(url: string): string {
    // Where the authority ends. The two charCode checks skip the generic
    // `indexOf('://')` scan for the two schemes that dominate real traffic
    // (http/https) — mirrors Elysia's `authorityEnd`
    // (`elysia2/dist/utils.js`).
    const authorityEnd =
        url.charCodeAt(4) === 58 /* : */
            ? 7
            : url.charCodeAt(5) === 58 /* : */
              ? 8
              : url.indexOf('://') + 3;

    // First "/" after the authority = path start. `-1` falls back to index 0
    // so a URL with no path segment keeps the historical result.
    const found = url.indexOf('/', authorityEnd);
    const pathStart = found === -1 ? 0 : found;

    // Single scan for the terminator. `#` is included for parity with
    // `new Request(url).url` inputs (the URL parser strips fragments, but
    // callers may hand us a raw URL string) — mirrors Hono's `getPath`
    // (`dist/utils/url.js`).
    for (let i = pathStart; i < url.length; i++) {
        const code = url.charCodeAt(i);
        if (code === 63 /* ? */ || code === 35 /* # */) {
            return url.slice(pathStart, i);
        }
    }
    return url.slice(pathStart);
}
