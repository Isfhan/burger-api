/**
 * Extracts the pathname from a full URL string, removing query parameters.
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

    // Find where query parameters start (if any)
    // Example: "/api/users/123?id=1" → pathEnd = 15 (at the "?")
    const pathEnd = url.indexOf('?', pathStart);

    // Extract just the pathname without query parameters
    // Example: "/api/users/123/profile"
    return pathEnd === -1
        ? url.substring(pathStart) // No query params
        : url.substring(pathStart, pathEnd); // Has query params, stop at "?"
}
