import type { CompiledHandler } from './types.js';
import { ROUTE_CONSTANTS } from '../utils/routing.js';

/**
 * Hono-style RegExp matcher for the dynamic (`:param` / `*`) route set.
 *
 * The trie stays the reference implementation; this matcher is a drop-in
 * replacement for its dispatch role in `Router.fetch` on runtimes without
 * a native pattern router (WinterCG targets). Design notes:
 *
 * - **Numeric capture groups, never named.** JS named groups must be unique
 *   per regex; two routes may legitimately reuse a param name. Each
 *   alternative's group indices are mapped to param names at build time.
 * - **Wrapper group per alternative.** Every alternative is wrapped in one
 *   capturing group whose definedness identifies which alternative matched —
 *   required because a base-path wildcard hit (`/files/*` on `/files`)
 *   leaves all inner captures undefined.
 * - **Two tiers preserve priority.** Param routes (no `*`) are compiled into
 *   one alternation, wildcard routes into another; the wildcard tier is only
 *   consulted when the param tier misses — mirroring the trie's
 *   `param > wildcard` fallback. Within a tier, alternatives are ordered by
 *   specificity so overlapping patterns resolve deterministically like the
 *   trie's static-before-param descent.
 * - **Segment-exact matching** with `[^/]*` captures reproduces the trie's
 *   trailing-slash semantics (`/users/` → `:id === ""`).
 * - **Bail-out guard:** absurdly large route sets fall back to the trie by
 *   returning `null` from the builder instead of compiling a pathological
 *   regex.
 */

export interface RegexRouteEntry {
    /** Route-definition path (internal format: `:param` / `*`). */
    path: string;
    handler: CompiledHandler;
    methods: Set<string>;
    isWildcard: boolean;
}

export interface RegexMatch {
    handler: CompiledHandler;
    methods: Set<string>;
    params: Record<string, string>;
    wildcardParams?: string[];
    isWildcard: boolean;
    pattern: string;
}

/** Hard limits that trigger a graceful fall back to the trie. */
const MAX_ROUTES = 5000;
const MAX_SOURCE_LENGTH = 100_000;

interface CompiledAlternative {
    /** Full alternative source including its wrapper group. */
    source: string;
    /** Param names for the INNER capture groups (wrapper excluded). */
    groupNames: string[];
    entry: RegexRouteEntry;
}

interface Tier {
    regex: RegExp;
    alternatives: CompiledAlternative[];
}

/**
 * Builds the matcher from the dynamic route set.
 *
 * @param order optional authoritative pattern order (from
 *        `Trie.orderedPatterns()`). When supplied, alternatives keep this
 *        exact sequence — a pre-order DFS of the trie encodes its per-node
 *        priority, which no flat heuristic can reproduce. When omitted
 *        (standalone use), the specificity heuristic orders them.
 * @returns a matcher function, or `null` when the route set should stay on
 *          the trie (empty set, size cap exceeded, or unusable patterns).
 */
export function buildRegexMatcher(
    entries: RegexRouteEntry[],
    order?: string[]
): ((path: string) => RegexMatch | null) | null {
    if (entries.length === 0 || entries.length > MAX_ROUTES) return null;

    const tier = compileTier(entries, order);
    if (!tier) return null;
    if (tier.regex.source.length > MAX_SOURCE_LENGTH) return null;

    // Trie semantics: "/" is the zero-segment path. A single leading param
    // (`/:id`) must NOT capture it — only an explicit root route may match.
    const hasRootEntry = entries.some(
        (e) => splitPattern(e.path).length === 0
    );

    return (path: string): RegexMatch | null => {
        if (path === '/' && !hasRootEntry) return null;
        return execTier(tier, path);
    };
}

function compileTier(
    entries: RegexRouteEntry[],
    order?: string[]
): Tier | null {
    if (entries.length === 0) return null;

    const byPath = new Map(entries.map((e) => [e.path, e]));
    let alternatives: CompiledAlternative[];

    if (order && order.length > 0) {
        alternatives = [];
        for (const path of order) {
            const entry = byPath.get(path);
            if (entry) alternatives.push(compileAlternative(entry));
        }
        // Patterns present in entries but missing from the order (should
        // not happen — both derive from the same compile pass) go last.
        for (const entry of entries) {
            if (!order.includes(entry.path)) {
                alternatives.push(compileAlternative(entry));
            }
        }
    } else {
        alternatives = entries
            .map((entry) => compileAlternative(entry))
            .sort(compareAlternatives);
    }

    const source = alternatives.map((a) => a.source).join('|');
    return { regex: new RegExp(source), alternatives };
}

function compileAlternative(entry: RegexRouteEntry): CompiledAlternative {
    const segments = splitPattern(entry.path);
    const groupNames: string[] = [];
    let body = '';

    // A literal root route ("/") matches the bare slash — the trie reaches
    // its root-node handler for the zero-segment path.
    if (segments.length === 0) {
        return { source: '(^/$)', groupNames, entry };
    }

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]!;
        const lastWildcard =
            i === segments.length - 1 &&
            (seg === ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX ||
                seg.startsWith(ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX));
        if (lastWildcard) {
            // Wildcard: optional `/rest`. Keeping the leading slash inside
            // the capture preserves the trailing-slash distinction
            // (`/files` → undefined, `/files/` → '/').
            body += '(/.*)?';
            groupNames.push('*');
            break;
        }
        if (seg.startsWith(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX)) {
            body += '/([^/]*)';
            groupNames.push(seg.slice(1));
            continue;
        }
        body += '/' + escapeLiteral(seg);
    }

    // One wrapper group per alternative identifies the matching branch.
    return { source: `(^${body}$)`, groupNames, entry };
}

/**
 * Ascending sort key — lower is tried earlier. Encodes the trie's descent
 * preference globally: deepest literal anchoring wins, then fewer dynamics,
 * then a later first-dynamic position (`/x/b/:c` before `/x/:a/y`), then
 * params before wildcards.
 */
function compareAlternatives(
    a: CompiledAlternative,
    b: CompiledAlternative
): number {
    const ka = specificityKey(a);
    const kb = specificityKey(b);
    for (let i = 0; i < 4; i++) {
        if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    }
    // Deterministic tiebreak for otherwise-equal shapes.
    return a.entry.path < b.entry.path ? -1 : a.entry.path > b.entry.path ? 1 : 0;
}

function specificityKey(a: CompiledAlternative): number[] {
    const segs = splitPattern(a.entry.path);
    let paramCount = 0;
    let wildcardCount = 0;
    let firstDynamic = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i]!;
        if (s.startsWith(ROUTE_CONSTANTS.WILDCARD_SEGMENT_PREFIX)) {
            wildcardCount++;
            paramCount++;
            if (firstDynamic === Number.MAX_SAFE_INTEGER) firstDynamic = i;
            continue;
        }
        if (s.startsWith(ROUTE_CONSTANTS.DYNAMIC_SEGMENT_PREFIX)) {
            paramCount++;
            if (firstDynamic === Number.MAX_SAFE_INTEGER) firstDynamic = i;
        }
    }
    return [
        -(segs.length - paramCount),
        paramCount,
        firstDynamic === Number.MAX_SAFE_INTEGER
            ? Number.MAX_SAFE_INTEGER
            : -firstDynamic,
        wildcardCount,
    ];
}

function execTier(tier: Tier, path: string): RegexMatch | null {
    const match = tier.regex.exec(path);
    if (!match) return null;

    // Locate the matched alternative via its wrapper group.
    let absStart = 1; // match[0] occupies index 0
    for (const candidate of tier.alternatives) {
        const width = candidate.groupNames.length + 1; // inner + wrapper
        if (match[absStart] !== undefined) {
            return materialize(candidate, match, absStart);
        }
        absStart += width;
    }
    return null;
}

function materialize(
    alt: CompiledAlternative,
    match: RegExpExecArray,
    absStart: number
): RegexMatch | null {
    const params: Record<string, string> = {};
    let rawWildcard: string | undefined;

    for (let i = 0; i < alt.groupNames.length; i++) {
        const name = alt.groupNames[i]!;
        const value = match[absStart + 1 + i];
        if (value === undefined) continue;
        if (name === '*') {
            rawWildcard = value;
            continue;
        }
        params[name] = safeDecode(value);
    }

    let wildcardParams: string[] | undefined;
    if (rawWildcard !== undefined) {
        // rawWildcard keeps its leading '/' ('/a/b'); normalize exactly like
        // the trie: base hit → [], '/files/' → [''], '/files/a/' → ['a',''].
        wildcardParams =
            rawWildcard === '/'
                ? ['']
                : rawWildcard.slice(1).split('/').map(safeDecode);
    }

    return {
        handler: alt.entry.handler,
        methods: alt.entry.methods,
        params,
        wildcardParams,
        isWildcard: rawWildcard !== undefined || alt.entry.isWildcard,
        pattern: alt.entry.path,
    };
}

function splitPattern(path: string): string[] {
    return path.split('/').slice(1).filter((s) => s !== '');
}

function escapeLiteral(segment: string): string {
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeDecode(segment: string): string {
    if (segment === '') return segment;
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}
