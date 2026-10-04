/**
 * Legacy segment trie kept as a differential oracle for `src/router/trie.ts`.
 * It must keep behaving exactly as the shipped trie did; `trie-fuzz.test.ts`
 * asserts the current radix matcher produces identical results.
 */
import type { CompiledHandler } from '../../src/router/types';
import { ROUTE_CONSTANTS } from '../../src/utils/routing';

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
export interface LegacyTrieMatch {
    handler: CompiledHandler;
    methods: Set<string>;
    params: Record<string, string>;
    wildcardParams?: string[];
    isWildcard: boolean;
    /** The route-definition path (for `RouteMeta.pattern`). */
    pattern: string;
}

export class LegacyTrie {
    private root: DynTrieNode = { children: new Map() };

    insert(
        path: string,
        handler: CompiledHandler,
        methods: Set<string>,
        isWildcard: boolean
    ): void {
        const segments = splitPattern(path);
        let node = this.root;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i]!;
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
                if (i < segments.length - 1) {
                    throw new Error(
                        `Wildcard segment "*" must be the last segment in route path "${path}" — ` +
                            `segments after a wildcard can never be matched.`
                    );
                }
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

    match(pathname: string): LegacyTrieMatch | null {
        const segments: string[] = [];
        splitPathInto(pathname, segments);
        return this.descend(this.root, segments, 0, {});
    }

    allowedMethods(pathname: string): Set<string> | null {
        const m = this.match(pathname);
        return m ? m.methods : null;
    }

    orderedPatterns(): string[] {
        const out: string[] = [];
        const visit = (node: DynTrieNode): void => {
            if (node.handler && node.pattern) out.push(node.pattern);
            for (const child of node.children.values()) visit(child);
            if (node.paramChild) visit(node.paramChild);
            if (node.wildcardChild) visit(node.wildcardChild);
        };
        visit(this.root);
        return out;
    }

    private descend(
        node: DynTrieNode,
        segments: string[],
        i: number,
        params: Record<string, string>
    ): LegacyTrieMatch | null {
        // Consumed all segments: a complete route or a base-path wildcard.
        if (i === segments.length) {
            if (node.handler && node.methods) {
                return {
                    handler: node.handler,
                    methods: node.methods,
                    params,
                    isWildcard: !!node.isWildcard,
                    pattern: node.pattern!,
                };
            }
            if (node.wildcardChild?.handler) {
                return {
                    handler: node.wildcardChild.handler,
                    methods: node.wildcardChild.methods!,
                    params,
                    wildcardParams: [],
                    isWildcard: true,
                    pattern: node.wildcardChild.pattern!,
                };
            }
            return null;
        }

        const segment = segments[i]!;

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
            const count = segments.length - i;
            const wildcardParams: string[] = new Array(count);
            for (let j = 0; j < count; j++) {
                wildcardParams[j] = segments[i + j]!;
            }
            return {
                handler: node.wildcardChild.handler,
                methods: node.wildcardChild.methods!,
                params,
                wildcardParams,
                isWildcard: true,
                pattern: node.wildcardChild.pattern!,
            };
        }

        return null;
    }
}

/**
 * Build-time pattern split for `insert`: segments are not decoded, so
 * `:param` / `*` markers stay verbatim.
 */
function splitPattern(path: string): string[] {
    const raw = path.split('/');
    const segments = raw.slice(1); // drop the leading '' before the first '/'
    if (path.endsWith('/') && path.length > 1) {
        return segments;
    }
    if (segments.length > 0 && segments[segments.length - 1] === '') {
        segments.pop();
    }
    return segments;
}

/**
 * Splits a pathname into `out` without per-request `split()`/`map()` arrays.
 * Percent-decodes each segment only when it contains `%`.
 */
function splitPathInto(pathname: string, out: string[]): void {
    let start = pathname.charCodeAt(0) === 47 /* '/' */ ? 1 : 0;
    let count = 0;
    for (let i = start; i < pathname.length; i++) {
        if (pathname.charCodeAt(i) === 47 /* '/' */) {
            out[count++] = safeDecode(pathname.slice(start, i));
            start = i + 1;
        }
    }
    if (start < pathname.length || pathname.length > 1) {
        // Keep the trailing '' so a `:param` can capture the empty value.
        out[count++] = safeDecode(pathname.slice(start));
    }
    out.length = count;
}

function safeDecode(segment: string): string {
    if (segment === '' || segment.indexOf('%') === -1) return segment;
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}
