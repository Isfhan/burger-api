import type { CompiledHandler } from './types';
import { ROUTE_CONSTANTS } from '../utils/routing';

/**
 * Internal trie node for `:param` and `*` routes.
 * Kept independent of the file-scan `TrieNode` (types/index.ts); this node
 * stores the compiled handler and the set of allowed methods instead of the
 * raw `RouteDefinition`.
 */
interface DynTrieNode {
    children: Map<string, DynTrieNode>;
    paramChild?: DynTrieNode;
    paramName?: string;
    wildcardChild?: DynTrieNode;
    isWildcard?: boolean;
    handler?: CompiledHandler;
    methods?: Set<string>;
    /** The route-definition path this node was inserted with (for `RouteMeta`). */
    pattern?: string;
}

/**
 * Result of a successful trie match.
 */
export interface TrieMatch {
    handler: CompiledHandler;
    methods: Set<string>;
    params: Record<string, string>;
    wildcardParams?: string[];
    isWildcard: boolean;
    /** The route-definition path (for `RouteMeta.pattern`). */
    pattern: string;
}

/**
 * Optimized radix trie (internal routing trie) for `:param` and `*` routes.
 *
 * Priority order (highest → lowest): static segment > `:param` > `*`.
 * A `*` route also matches its own base path (e.g. `/files/*` matches `/files`)
 * to preserve the behavior previously handled by a separate base-path
 * registration in `index.ts`.
 *
 * The matcher backtracks: if descending a static child does not yield a
 * complete route, it falls back to the `:param` / `*` siblings — mirroring
 * Bun's own route resolution (so a static prefix that is only a partial match
 * does not shadow a wildcard sibling).
 *
 * Built once at compile time; read-only at request time.
 */
export class Trie {
    private root: DynTrieNode = { children: new Map() };

    /**
     * Inserts a compiled route into the trie.
     * @throws on ambiguous param folders (two different param names at the same level).
     */
    insert(
        path: string,
        handler: CompiledHandler,
        methods: Set<string>,
        isWildcard: boolean
    ): void {
        const segments = splitPath(path);
        let node = this.root;

        for (const segment of segments) {
            if (segment.startsWith(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX)) {
                const name = segment.slice(1);
                if (!node.paramChild) {
                    node.paramChild = { children: new Map() };
                } else if (
                    node.paramChild.paramName !== undefined &&
                    node.paramChild.paramName !== name
                ) {
                    throw new Error(
                        `Ambiguous dynamic route folders at "${path}": ` +
                            `":${node.paramChild.paramName}" and ":${name}" cannot coexist at the same level.`
                    );
                }
                node.paramChild.paramName = name;
                node = node.paramChild;
            } else if (
                segment.startsWith(ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX)
            ) {
                if (!node.wildcardChild) {
                    node.wildcardChild = { children: new Map() };
                }
                node.wildcardChild.isWildcard = true;
                node = node.wildcardChild;
            } else {
                if (!node.children.has(segment)) {
                    node.children.set(segment, { children: new Map() });
                }
                node = node.children.get(segment)!;
            }
        }

        node.handler = handler;
        node.methods = methods;
        node.isWildcard = isWildcard;
        node.pattern = path;
    }

    /**
     * Matches a pathname against the trie.
     * @param pathname A pathname. A single trailing slash is preserved so that
     *        `:param` routes can capture an empty value (e.g. `/users/` → `:id`
     *        with `id === ""`), matching Bun's native behavior.
     * @returns the match result, or `null` if no route matches.
     */
    match(pathname: string): TrieMatch | null {
        const segments = splitPath(pathname).map((s) => safeDecode(s));
        return this.descend(this.root, segments, 0, {});
    }

    /**
     * Returns the allowed methods for a pathname, or `null` if it does not match.
     */
    allowedMethods(pathname: string): Set<string> | null {
        const m = this.match(pathname);
        return m ? m.methods : null;
    }

    private descend(
        node: DynTrieNode,
        segments: string[],
        i: number,
        params: Record<string, string>
    ): TrieMatch | null {
        // Consumed all segments: a complete route or a base-path wildcard.
        if (i === segments.length) {
            if (node.handler && node.methods) {
                return {
                    handler: node.handler,
                    methods: node.methods,
                    params: { ...params },
                    isWildcard: !!node.isWildcard,
                    pattern: node.pattern!,
                };
            }
            if (node.wildcardChild?.handler) {
                return {
                    handler: node.wildcardChild.handler,
                    methods: node.wildcardChild.methods!,
                    params: { ...params },
                    wildcardParams: [],
                    isWildcard: true,
                    pattern: node.wildcardChild.pattern!,
                };
            }
            return null;
        }

        const segment = segments[i];

        // Priority 1: exact static segment (try first; backtrack if it dead-ends).
        const child = node.children.get(segment);
        if (child) {
            const res = this.descend(child, segments, i + 1, params);
            if (res) return res;
        }

        // Priority 2: dynamic parameter.
        if (node.paramChild) {
            const pc = node.paramChild;
            const name = pc.paramName!;
            const prev = params[name];
            params[name] = segment;
            const res = this.descend(pc, segments, i + 1, params);
            if (res) return res;
            if (prev === undefined) delete params[name];
            else params[name] = prev;
        }

        // Priority 3: wildcard — capture the rest (including the empty
        // trailing segment produced by a path that ends with `/`).
        if (node.wildcardChild?.handler) {
            return {
                handler: node.wildcardChild.handler,
                methods: node.wildcardChild.methods!,
                params: { ...params },
                wildcardParams: segments.slice(i),
                isWildcard: true,
                pattern: node.wildcardChild.pattern!,
            };
        }

        return null;
    }
}

/**
 * Splits a pathname into segments for trie matching.
 *
 * Unlike a naive `split('/').filter(Boolean)`, this preserves a single trailing
 * empty segment when the path ends with `/`, so that `:param` routes can capture
 * an empty value (e.g. `/users/` → `["users", ""]` → `:id === ""`). The leading
 * empty segment produced by the leading `/` is dropped.
 */
function splitPath(pathname: string): string[] {
    const raw = pathname.split('/');
    const segments = raw.slice(1); // drop the leading '' before the first '/'
    if (pathname.endsWith('/') && pathname.length > 1) {
        // keep the trailing '' so a `:param` can capture the empty value
        return segments;
    }
    if (segments.length > 0 && segments[segments.length - 1] === '') {
        segments.pop();
    }
    return segments;
}

/**
 * Decodes a single path segment, falling back to the raw value if decoding fails
 * (e.g. malformed percent-encoding).
 */
function safeDecode(segment: string): string {
    if (segment === '') return segment;
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}
