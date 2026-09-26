import type { CompiledHandler } from './types.js';
import { ROUTE_CONSTANTS } from '../utils/routing.js';

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

/* ------------------------------------------------------------------ *
 * Radix matcher (fast path)
 *
 * A compressed character radix tree over the raw pathname — the technique
 * Elysia's memoirist uses (see research report Q8/Q9): literal runs are
 * compared with `charCodeAt` loops (or one slice compare for long runs)
 * instead of splitting the request path into a per-segment array and
 * probing a `Map` at every level. `:param` edges consume one segment up to
 * the next `/`; `*` edges capture the remainder (and, like the legacy
 * matcher, also match their own base path).
 *
 * Only absolute, percent-free pathnames are served here. Anything else
 * falls back to the segment matcher below, whose decoding semantics are
 * preserved exactly (`%2F` inside a segment, decoded static segments, …).
 * ------------------------------------------------------------------ */

/** A terminal route stored in the radix tree. */
interface RadixLeaf {
    handler: CompiledHandler;
    methods: Set<string>;
    pattern: string;
    isWildcard: boolean;
    /** Param names captured along the path, in capture order (excludes `*`). */
    names: string[];
}

/** One-segment `:param` edge. */
interface RadixParam {
    name: string;
    /** Route terminal when the pattern ends at this param. */
    store: RadixLeaf | null;
    /** Continuation subtree after the param (literal text / more params). */
    child: RadixNode | null;
    /** Terminal wildcard directly after the param (`/:x/*`). */
    wildcard: RadixLeaf | null;
}

/** A compressed radix node: one literal run of the pattern. */
interface RadixNode {
    /** Literal text matched at the current position (may be `''`). */
    part: string;
    /** Route terminal when the pattern ends right after `part`. */
    store: RadixLeaf | null;
    /** Terminal wildcard attached at this node. */
    wildcard: RadixLeaf | null;
    /** Literal continuations keyed by their first character code. */
    inert: Map<number, RadixNode> | null;
    /** Param edge. */
    param: RadixParam | null;
}

function createRadixNode(part: string): RadixNode {
    return { part, store: null, wildcard: null, inert: null, param: null };
}

function cloneRadixNode(node: RadixNode, part: string): RadixNode {
    return {
        part,
        store: node.store,
        wildcard: node.wildcard,
        inert: node.inert,
        param: node.param,
    };
}

/** Turns a split-out node into a branching parent of `children`. */
function resetRadixNode(
    node: RadixNode,
    part: string,
    children: RadixNode[]
): void {
    node.part = part;
    node.store = null;
    node.wildcard = null;
    node.param = null;
    const inert = new Map<number, RadixNode>();
    for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        inert.set(child.part.charCodeAt(0), child);
    }
    node.inert = inert;
}

/**
 * Per-match capture scratch. Matching is synchronous and never re-enters
 * (no user code runs while a match is in progress), so one module-level
 * buffer replaces a per-request array — same trick as memoirist's
 * `matchedNames`/`matchedIndex`.
 */
const captured: string[] = [];
let capturedCount = 0;
let wildcardCapture: string | null = null;

/** Literal runs shorter than this compare with a char-code loop, not a slice. */
const CHAR_COMPARE_LIMIT = 15;

/**
 * Optimized dynamic-route matcher.
 *
 * Dispatch rules, identical to the legacy segment matcher:
 * - Priority per node: literal continuation > `:param` > `*`, with
 *   backtracking when a literal prefix dead-ends.
 * - A `*` route also matches its own base path (`/files/*` matches
 *   `/files`, `wildcardParams: []`).
 * - A trailing slash is preserved: `/users/` binds `:id === ""` (the Router
 *   rejects empty params — the loose-slash retry then runs).
 * - Ambiguous param folders at one level and non-terminal wildcards throw
 *   at insert time.
 */
export class Trie {
    private root: RadixNode = createRadixNode('/');

    /**
     * Segment matcher retaining the exact decoding semantics for
     * percent-encoded or non-absolute pathnames. Every route is inserted
     * into both structures; the hot path never touches this one when the
     * pathname is absolute and percent-free.
     */
    private legacy = new LegacyTrie();

    /**
     * Inserts a compiled route into the trie.
     * @throws on ambiguous param folders (two different param names at the same level)
     * or a wildcard segment that is not the last segment (unmatchable by design).
     */
    insert(
        path: string,
        handler: CompiledHandler,
        methods: Set<string>,
        isWildcard: boolean
    ): void {
        this.insertRadix(path, handler, methods, isWildcard);
        this.legacy.insert(path, handler, methods, isWildcard);
    }

    /**
     * Matches a pathname against the trie.
     * @param pathname A pathname. A single trailing slash is preserved so that
     * `:param` routes can capture an empty value (e.g. `/users/` → `:id`
     * with `id === ""`), matching Bun's native behavior.
     * @returns the match result, or `null` if no route matches.
     */
    match(pathname: string): TrieMatch | null {
        if (
            pathname.charCodeAt(0) === 47 /* '/' */ &&
            pathname.indexOf('%') === -1 &&
            pathname.indexOf('//') === -1
        ) {
            return this.matchRadix(pathname);
        }
        return this.legacy.match(pathname);
    }

    /**
     * Returns the allowed methods for a pathname, or `null` if it does not match.
     */
    allowedMethods(pathname: string): Set<string> | null {
        const m = this.match(pathname);
        return m ? m.methods : null;
    }

    /**
     * Emits every registered pattern in strict match-priority order.
     *
     * The traversal is a pre-order DFS following the same per-node priority
     * the matcher uses — static continuations (insertion order), then the
     * `:param` subtree, then the `*` wildcard — so for any request path, the
     * first emitted pattern that can match it is exactly the pattern the trie
     * would select. This is the authoritative ordering source for the RegExp
     * matcher (`regex-matcher.ts`).
     */
    orderedPatterns(): string[] {
        const out: string[] = [];
        this.visitRadix(this.root, out);
        return out;
    }

    private visitRadix(node: RadixNode, out: string[]): void {
        if (node.store) out.push(node.store.pattern);
        if (node.inert) {
            for (const child of node.inert.values()) {
                this.visitRadix(child, out);
            }
        }
        if (node.param) {
            if (node.param.store) out.push(node.param.store.pattern);
            if (node.param.child) this.visitRadix(node.param.child, out);
            if (node.param.wildcard) out.push(node.param.wildcard.pattern);
        }
        if (node.wildcard) out.push(node.wildcard.pattern);
    }

    // --- build ---------------------------------------------------------

    private insertRadix(
        path: string,
        handler: CompiledHandler,
        methods: Set<string>,
        isWildcard: boolean
    ): void {
        const segments = splitPattern(path);

        // Locate a terminal wildcard segment (always last — enforced below).
        let wildcardIndex = -1;
        for (let i = 0; i < segments.length; i++) {
            if (
                segments[i]!.startsWith(ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX)
            ) {
                if (i < segments.length - 1) {
                    throw new Error(
                        `Wildcard segment "*" must be the last segment in route path "${path}" — ` +
                            `segments after a wildcard can never be matched.`
                    );
                }
                wildcardIndex = i;
                break;
            }
        }

        const names: string[] = [];
        let node = this.root;
        // Param edge awaiting its continuation / terminal (set by a `:param`
        // token, consumed by the next literal run or by the terminal itself).
        let pending: RadixParam | null = null;

        const flushLiteral = (trailingSlash: boolean): void => {
            if (literal.length === 0 && !trailingSlash) return;
            const text =
                literal.length === 0
                    ? '/'
                    : '/' + literal.join('/') + (trailingSlash ? '/' : '');
            if (pending !== null) {
                const child = pending.child;
                if (child === null) {
                    pending.child = createRadixNode(text);
                    node = pending.child;
                } else {
                    // `insertPart` mutates the existing subtree in place; the
                    // subtree root stays `pending.child`.
                    node = this.insertPart(child, text);
                }
                pending = null;
            } else {
                node = this.insertPart(node, text);
            }
            literal.length = 0;
        };
        const literal: string[] = [];

        for (let i = 0; i < segments.length; i++) {
            if (i === wildcardIndex) break;
            const segment = segments[i]!;
            if (segment.startsWith(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX)) {
                // A param terminates the current literal run with '/'.
                flushLiteral(true);
                if (pending !== null) {
                    // Consecutive params: materialize the in-between node.
                    pending.child ??= createRadixNode('');
                    node = pending.child;
                    pending = null;
                }
                const name = segment.slice(1);
                if (node.param !== null) {
                    if (node.param.name !== name) {
                        throw new Error(
                            `Ambiguous dynamic route folders at "${path}": ` +
                                `":${node.param.name}" and ":${name}" cannot coexist at the same level.`
                        );
                    }
                } else {
                    node.param = {
                        name,
                        store: null,
                        child: null,
                        wildcard: null,
                    };
                }
                names.push(name);
                pending = node.param;
            } else {
                literal.push(segment);
            }
        }

        const leaf = (
            wildcard: boolean
        ): RadixLeaf => ({
            handler,
            methods,
            pattern: path,
            isWildcard: wildcard ? true : isWildcard,
            names: names.slice(),
        });

        if (wildcardIndex !== -1) {
            flushLiteral(false);
            if (pending !== null) {
                // `/:x/*`: the wildcard hangs off the param edge.
                pending.wildcard = leaf(true);
                return;
            }
            node.wildcard = leaf(true);
            return;
        }

        flushLiteral(false);
        if (pending !== null) {
            pending.store = leaf(false);
            return;
        }
        node.store = leaf(false);
    }

    /**
     * Descends `part` into the radix subtree, splitting nodes where the
     * existing literal run and `part` diverge (memoirist's insert). Returns
     * the node whose `part` ends where `part` ends.
     */
    private insertPart(node: RadixNode, part: string): RadixNode {
        let current = node;
        let offset = 0;
        for (;;) {
            if (offset === part.length) {
                if (offset < current.part.length) {
                    // `part` is a strict prefix of the existing run.
                    const suffix = cloneRadixNode(
                        current,
                        current.part.slice(offset)
                    );
                    resetRadixNode(current, part, [suffix]);
                }
                return current;
            }
            if (offset === current.part.length) {
                const code = part.charCodeAt(offset);
                let inert = current.inert;
                if (inert === null) {
                    inert = new Map();
                    current.inert = inert;
                }
                const child = inert.get(code);
                if (child !== undefined) {
                    current = child;
                    part = part.slice(offset);
                    offset = 0;
                    continue;
                }
                const created = createRadixNode(part.slice(offset));
                inert.set(code, created);
                return created;
            }
            if (part.charCodeAt(offset) !== current.part.charCodeAt(offset)) {
                const existing = cloneRadixNode(
                    current,
                    current.part.slice(offset)
                );
                const created = createRadixNode(part.slice(offset));
                resetRadixNode(current, current.part.slice(0, offset), [
                    existing,
                    created,
                ]);
                return created;
            }
            offset++;
        }
    }

    // --- match ---------------------------------------------------------

    private matchRadix(pathname: string): TrieMatch | null {
        capturedCount = 0;
        wildcardCapture = null;
        const leaf = this.matchNode(this.root, pathname, 0);
        if (leaf === null) return null;

        const params: Record<string, string> = {};
        const names = leaf.names;
        for (let i = 0; i < names.length; i++) {
            params[names[i]!] = captured[i]!;
        }
        const wildcardParams =
            leaf.isWildcard && wildcardCapture !== null
                ? splitWildcardCapture(wildcardCapture)
                : undefined;
        return {
            handler: leaf.handler,
            methods: leaf.methods,
            params,
            wildcardParams,
            isWildcard: leaf.isWildcard,
            pattern: leaf.pattern,
        };
    }

    private matchNode(
        node: RadixNode,
        url: string,
        start: number
    ): RadixLeaf | null {
        const part = node.part;
        const partLength = part.length;
        if (partLength > 0) {
            const end = start + partLength;
            if (end > url.length) return null;
            if (partLength < CHAR_COMPARE_LIMIT) {
                for (let i = 0, j = start; i < partLength; i++, j++) {
                    if (part.charCodeAt(i) !== url.charCodeAt(j)) return null;
                }
            } else if (url.slice(start, end) !== part) {
                return null;
            }
        }
        const pos = start + partLength;

        const param = node.param;
        if (pos === url.length) {
            if (node.store !== null) return node.store;
            if (node.wildcard !== null) {
                wildcardCapture = '';
                return node.wildcard;
            }
            if (param !== null && pos > 1) {
                // Trailing-slash form: the empty final segment is the value.
                // (`/` alone has no trailing empty segment — the legacy
                // matcher's zero-segment path.) No continuation can match at
                // end-of-path; only the param's own terminal / wildcard.
                const saved = capturedCount;
                captured[capturedCount++] = '';
                if (param.store !== null) return param.store;
                if (param.wildcard !== null) {
                    wildcardCapture = '';
                    return param.wildcard;
                }
                capturedCount = saved;
            }
            return null;
        }

        // Priority 1: literal continuation (backtrack if it dead-ends).
        const inert = node.inert;
        if (inert !== null) {
            const child = inert.get(url.charCodeAt(pos));
            if (child !== undefined) {
                const leaf = this.matchNode(child, url, pos);
                if (leaf !== null) return leaf;
            }
        }

        // Priority 2: `:param` — one segment up to the next `/`.
        if (param !== null) {
            const saved = capturedCount;
            let slash = url.indexOf('/', pos);
            if (slash === -1) slash = url.length;
            captured[capturedCount++] = url.slice(pos, slash);
            if (slash === url.length) {
                // Segment ends at end-of-path: only the param's own terminal.
                if (param.store !== null) return param.store;
            } else if (param.child !== null) {
                const leaf = this.matchNode(param.child, url, slash);
                if (leaf !== null) return leaf;
            }
            if (param.wildcard !== null) {
                wildcardCapture = url.slice(slash);
                return param.wildcard;
            }
            capturedCount = saved;
        }

        // Priority 3: wildcard — capture the remainder. The capture starts at
        // a segment boundary: the node's literal must end with `/` (root
        // wildcard) or the next character must be `/`.
        if (node.wildcard !== null) {
            if (
                part.charCodeAt(partLength - 1) === 47 /* '/' */ ||
                url.charCodeAt(pos) === 47 /* '/' */
            ) {
                wildcardCapture = url.slice(pos);
                return node.wildcard;
            }
        }
        return null;
    }
}

/**
 * Splits a wildcard capture (the text after the route's base path) into its
 * segments. `''` is a base-path hit (no segments). The capture normally
 * starts with `/` (everything after the base path's slash); a root wildcard
 * (`/*`) captures from the first character instead. A trailing empty segment
 * is preserved, exactly like `String.split('/')`.
 */
function splitWildcardCapture(raw: string): string[] {
    if (raw === '') return [];
    const out: string[] = [];
    let start = raw.charCodeAt(0) === 47 /* '/' */ ? 1 : 0;
    for (let i = start; i < raw.length; i++) {
        if (raw.charCodeAt(i) === 47 /* '/' */) {
            out.push(raw.slice(start, i));
            start = i + 1;
        }
    }
    out.push(raw.slice(start));
    return out;
}

/**
 * Build-time pattern split (used by both matchers): segments are NOT
 * decoded — `:param` / `*` markers and static pattern text are stored
 * verbatim.
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

/* ------------------------------------------------------------------ *
 * Segment matcher (exact fallback)
 *
 * Retained verbatim for percent-encoded and non-absolute pathnames. It
 * decodes each request segment before comparison (and per wildcard
 * segment), semantics the radix matcher does not reproduce.
 * ------------------------------------------------------------------ */

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

class LegacyTrie {
    private root: DynTrieNode = { children: new Map() };

    /** {@link Trie.insert} — see the public class for the contract. */
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

    /** {@link Trie.match} — see the public class for the contract. */
    match(pathname: string): TrieMatch | null {
        const segments: string[] = [];
        splitPathInto(pathname, segments);
        // ONE params object per match: `descend` writes into it while
        // backtracking (restoring previous values on dead ends) and returns it
        // by reference on success — no `{ ...params }` copy per candidate.
        return this.descend(this.root, segments, 0, {});
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
 * Splits a pathname into `out` for legacy matching (no `split()` / `map()`
 * arrays per request).
 *
 * Unlike a naive `split('/').filter(Boolean)`, this preserves a single trailing
 * empty segment when the path ends with `/`, so that `:param` routes can capture
 * an empty value (e.g. `/users/` → `["users", ""]` → `:id === ""`). The leading
 * empty segment produced by the leading `/` is dropped.
 *
 * Each segment is percent-decoded as it is emitted, but only when it actually
 * contains `%`.
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

/**
 * Decodes a single path segment, falling back to the raw value if decoding fails
 * (e.g. malformed percent-encoding). Segments without `%` are returned as-is
 * (no `decodeURIComponent` call).
 */
function safeDecode(segment: string): string {
    if (segment === '' || segment.indexOf('%') === -1) return segment;
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}
