/**
 * Extracts the pathname from a full URL string, removing query parameters and
 * fragments.
 * @param url - The full URL string (e.g., "http://localhost:4000/api/users/123/profile?id=1")
 * @returns The extracted pathname (e.g., "/api/users/123/profile")
 */
export function extractPathnameFromUrl(url: string): string {
    // Where the authority ends. The charCode checks fast-path http/https
    // instead of scanning for '://'.
    const authorityEnd =
        url.charCodeAt(4) === 58 /* : */
            ? 7
            : url.charCodeAt(5) === 58 /* : */
              ? 8
              : url.indexOf('://') + 3;

    // Path starts at the first "/" after the authority; no path segment
    // falls back to index 0.
    const found = url.indexOf('/', authorityEnd);
    const pathStart = found === -1 ? 0 : found;

    // Single scan for `?` or `#`. Raw URL strings may still carry a fragment
    // even though the URL parser strips it.
    for (let i = pathStart; i < url.length; i++) {
        const code = url.charCodeAt(i);
        if (code === 63 /* ? */ || code === 35 /* # */) {
            return url.slice(pathStart, i);
        }
    }
    return url.slice(pathStart);
}
