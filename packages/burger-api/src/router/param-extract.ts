import { extractPathnameFromUrl } from '../utils/wildcard.js';
import { ROUTE_CONSTANTS } from '../utils/routing.js';
import type { ContextInit } from '../context/types.js';

/**
 * Web-Standard param extraction for native route dispatch.
 *
 * Bun's native `routes` map matches a pattern but does not expose extracted
 * params, so this derives the same `ContextInit` the trie would produce from
 * the `Request` URL — identical behavior, and the logic stays
 * runtime-agnostic (WinterCG). Non-Bun adapters dispatch through
 * `Router.fetch` + trie and never use it.
 *
 * The pattern's segment layout is compiled once per route
 * (`compilePatternSegments`); request handling does one URL scan and decodes
 * only `%`-bearing segments.
 */

/**
 * Compile-time pattern layout: which pattern segments are params and where
 * the wildcard sits. Built once per route (never per request).
 */
export interface CompiledPatternSegments {
    /** Param name per pattern segment (`undefined` for static / wildcard). */
    names: (string | undefined)[];
    /** Index of the `*` pattern segment, or `-1`. */
    wildcardIndex: number;
}

/** Compiles a route pattern (e.g. `/users/:id/*`) into its segment layout. */
export function compilePatternSegments(
    pattern: string
): CompiledPatternSegments {
    const raw = pattern.split('/');
    // Drop the leading '' before the first '/'.
    const names: (string | undefined)[] = new Array(
        raw.length > 0 ? raw.length - 1 : 0
    );
    let wildcardIndex = -1;
    for (let i = 1; i < raw.length; i++) {
        const segment = raw[i]!;
        if (segment === ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX) {
            wildcardIndex = i - 1;
        } else if (
            segment.charCodeAt(0) === 58 /* ':' — DYNAMIC_SEGMENT_PREFIX */
        ) {
            names[i - 1] = segment.slice(1);
        }
    }
    return { names, wildcardIndex };
}

/** Decodes a path segment only when it actually carries a percent escape. */
function decodeSegment(segment: string): string {
    if (segment === '' || segment.indexOf('%') === -1) return segment;
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * Splits a pathname into segments, preserving a single trailing empty segment
 * when the path ends with `/` (so `/users/` yields `["users", ""]` and a
 * `:param` captures the empty value, matching the trie).
 */
function splitPath(pathname: string, out: string[]): string[] {
    let start = pathname.charCodeAt(0) === 47 /* '/' */ ? 1 : 0;
    let count = 0;
    for (let i = start; i < pathname.length; i++) {
        if (pathname.charCodeAt(i) === 47 /* '/' */) {
            out[count++] = pathname.slice(start, i);
            start = i + 1;
        }
    }
    if (start < pathname.length || pathname.length > 1) {
        out[count++] = pathname.slice(start);
    }
    out.length = count;
    return out;
}

/**
 * Builds the `ContextInit` (params / wildcardParams / route) for a request
 * Bun dispatched to a native `:param` or `*` route. `pattern` is the
 * route-definition path (e.g. `/users/:id`, `/files/*`); `compiled` is the
 * layout produced by {@link compilePatternSegments} at route-compile time.
 */
export function extractCtxInitWithSegments(
    request: Request,
    pattern: string,
    compiled: CompiledPatternSegments
): ContextInit {
    const pathname = extractPathnameFromUrl(request.url);
    const pathSegments: string[] = [];
    splitPath(pathname, pathSegments);

    const names = compiled.names;
    const wildcardIndex = compiled.wildcardIndex;
    let params: Record<string, string> | undefined;

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (name === undefined) continue;
        if (params === undefined) params = {};
        // A pattern segment without a URL segment captures the empty value
        // (matches the trie's `/users/` → `:id === ""` behavior).
        const raw = pathSegments[i];
        params[name] = raw === undefined ? '' : decodeSegment(raw);
    }

    const ctx: ContextInit = { route: { path: pathname, pattern } };
    if (params !== undefined) ctx.params = params;
    if (wildcardIndex !== -1) {
        const count = pathSegments.length - wildcardIndex;
        const wildcardParams: string[] = new Array(count > 0 ? count : 0);
        for (let i = 0; i < count; i++) {
            wildcardParams[i] = decodeSegment(pathSegments[wildcardIndex + i]!);
        }
        ctx.wildcardParams = wildcardParams;
    }
    return ctx;
}


