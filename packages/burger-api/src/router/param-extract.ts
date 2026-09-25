import { extractPathnameFromUrl } from '../utils/wildcard.js';
import { ROUTE_CONSTANTS } from '../utils/routing.js';
import type { ContextInit } from '../context/types.js';

/**
 * Web-Standard param extraction for native route dispatch.
 *
 * When a dynamic route is registered directly on Bun's native `routes` map, Bun
 * matches the path but does NOT expose extracted parameters (unlike its trie
 * fallback). This module derives the same `ContextInit` the trie would produce,
 * using only the `Request` URL, so the behavior is identical and the logic stays
 * runtime-agnostic (WinterCG-compatible). Non-Bun adapters that do not use
 * Bun's native `routes` map keep dispatching through `Router.fetch` + trie and
 * never touch this code.
 */

function safeDecode(segment: string): string {
    if (segment === '') return segment;
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * Splits a pathname into segments, preserving a single trailing empty segment
 * when the path ends with `/` (so `/users/` yields `["users", ""]` and a
 * `:param` captures the empty value, mirroring the trie's behavior).
 */
function splitPath(pathname: string): string[] {
    const raw = pathname.split('/');
    const segments = raw.slice(1); // drop the leading '' before the first '/'
    if (pathname.endsWith('/') && pathname.length > 1) {
        return segments;
    }
    if (segments.length > 0 && segments[segments.length - 1] === '') {
        segments.pop();
    }
    return segments;
}

/**
 * Builds the `ContextInit` (params / wildcardParams / route) for a request that
 * Bun dispatched to a native `:param` or `*` route. `pattern` is the
 * route-definition path (e.g. `/users/:id`, `/files/*`).
 */
export function extractCtxInit(
    request: Request,
    pattern: string,
    isWildcard: boolean
): ContextInit {
    const pathname = extractPathnameFromUrl(request.url);
    const patternSegs = pattern.split('/').slice(1);
    const pathSegs = splitPath(pathname).map(safeDecode);

    const params: Record<string, string> = {};
    let wildcardParams: string[] | undefined;

    for (let i = 0; i < patternSegs.length; i++) {
        const ps = patternSegs[i]!;
        if (ps === ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX) {
            wildcardParams = pathSegs.slice(i);
            break;
        }
        if (ps.startsWith(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX)) {
            const name = ps.slice(
                ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX.length
            );
            params[name] = pathSegs[i] ?? '';
        }
    }

    const ctx: ContextInit = { route: { path: pathname, pattern } };
    if (Object.keys(params).length > 0) ctx.params = params;
    if (wildcardParams) ctx.wildcardParams = wildcardParams;
    return ctx;
}
