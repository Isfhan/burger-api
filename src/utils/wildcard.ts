import type { BurgerRequest } from '../types/index';

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

/**
 * Extracts wildcard parameters from a request pathname and sets them on the request object.
 * @param request - The request object to modify
 * @param pathname - The pathname extracted from the URL (e.g., "/api/users/123/profile")
 * @param baseSegmentCount - Number of segments before the wildcard (e.g., 3 for "/api/users/:userId/*")
 */
export function extractWildcardParams(
    request: BurgerRequest,
    pathname: string,
    baseSegmentCount: number
): void {
    if (baseSegmentCount === 0) {
        // Fast path: The entire path is wildcard
        // Example: "/api/docs/*" where all segments after domain are wildcards
        // Just split everything and we're done!
        request.wildcardParams = pathname.split('/').filter(Boolean);
    } else {
        // Optimized path: Skip base segments and only collect wildcard segments
        // Example: "/api/users/123/settings/privacy"
        //   - We need to skip 3 segments (api, users, 123)
        //   - Only collect: ["settings", "privacy"]

        const wildcardParams: string[] = [];
        let segmentCount = 0; // Counts how many segments we've seen
        let start = pathname[0] === '/' ? 1 : 0; // Start after leading "/" if present

        // Loop through each character in the pathname
        // When we hit "/" or end of string, we know we found a segment
        for (let i = start; i <= pathname.length; i++) {
            // Found end of a segment (either "/" or end of string)
            if (i === pathname.length || pathname[i] === '/') {
                // Make sure it's not an empty segment (from double slashes)
                if (i > start) {
                    // Only save segments AFTER we've skipped the base segments
                    // Example: If baseSegmentCount=3, save segment 3, 4, 5, etc.
                    if (segmentCount >= baseSegmentCount) {
                        // Extract this segment from the pathname
                        // Example: pathname.substring(5, 13) might give "settings"
                        wildcardParams.push(pathname.substring(start, i));
                    }
                    segmentCount++; // Increment count for next segment
                }
                start = i + 1; // Move start position to character after "/"
            }
        }

        // Done! wildcardParams now contains only the wildcard segments
        // Example: ["settings", "privacy"] instead of ["api", "users", "123", "settings", "privacy"]
        request.wildcardParams = wildcardParams;
    }
}
