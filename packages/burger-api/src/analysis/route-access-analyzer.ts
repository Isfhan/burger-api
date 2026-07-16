import type { ContextField, RouteAccessInfo } from '../context/types';
import type { RouteDefinition } from '../types/index';
import { freezeRouteAccessInfo } from '../context/route-access';

/**
 * `RouteAccessAnalyzer` (M3) — an OPTIONAL, compile-time-only, self-contained
 * static analyzer.
 *
 * It inspects a route's handler + middleware *source* (via
 * `Function.prototype.toString()`) to produce a frozen `RouteAccessInfo` hint
 * describing which `BurgerContext` fields each route touches. Nothing here is
 * read at runtime in Phase 2, so any failure degrades to a safe default and can
 * never affect request correctness.
 *
 * Design constraints (ROADMAP-phase2.md §7):
 * - Self-contained: no import from `@burger-api/cli`, no `node:fs`.
 * - Reuses the discipline of `cli/src/utils/route-methods.ts`, not its code.
 * - `debug: true` → skip analysis entirely (return the safe empty default).
 * - Any parse error → try/catch → safe default (empty set, `unknown: false`).
 *
 * The analysis is heuristic (best-effort regex over source text). It is
 * intentionally conservative only in the "we can't tell" direction via the
 * `unknown` flag; a clean parse returns exactly the fields that were observed.
 */

const FIELD_KEYS: readonly ContextField[] = [
    'params',
    'query',
    'headers',
    'json',
    'validated',
    'set',
    'route',
    'wildcardParams',
];

/**
 * Strips block (`/* *\/`) and line (`//`) comments so that field tokens inside
 * comments are not mistaken for live access.
 */
function stripComments(source: string): string {
    // Block comments first, then line comments. Replace with a space (preserving
    // token boundaries) rather than removing, so `a/* x */.query` doesn't merge.
    let out = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
    out = out.replace(/\/\/[^\n]*/g, ' ');
    return out;
}

/**
 * Detects a `field` reference in source text, covering both member access
 * (`.field`) and computed/bracket access (`['field']` / `["field"]`).
 */
function referencesField(source: string, field: string): boolean {
    const dot = new RegExp(`\\.\\s*${field}\\b`);
    const bracket = new RegExp(
        `\\[\\s*['"]\\s*${field}\\s*['"]\\s*\\]`
    );
    return dot.test(source) || bracket.test(source);
}

function safeToString(fn: unknown): string {
    try {
        return typeof fn === 'function' ? fn.toString() : '';
    } catch {
        return '';
    }
}

/**
 * Detects indirect/aliased access patterns the per-field scanner cannot
 * resolve statically. Per ROADMAP-phase2 §6.3.1 the analyzer is conservative:
 * when it cannot prove which fields a route reads, the whole route is marked
 * `unknown: true` (every field treated as used) rather than risk hiding a field
 * the handler actually needs.
 */
function isAmbiguous(source: string): boolean {
    // `const r = req` / `let r = req` / `var r = req` — aliasing the request.
    if (/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*req\b/.test(source)) {
        return true;
    }
    // Plain reassignment `r = req` (not a comparison / function call).
    if (/\b[A-Za-z_$][\w$]*\s*=\s*req\b/.test(source)) return true;
    // Computed member access other than a quoted literal: `req[x]` / `req[`var`]`.
    if (/\brew\s*\[\s*(?!['"`])/.test(source)) return true;
    // Spread / rest: `...req`.
    if (/\brew\s*\.\.\./.test(source)) return true;
    return false;
}

/**
 * Analyzes one route definition and returns a frozen `RouteAccessInfo`.
 */
export function analyzeRouteAccess(
    def: RouteDefinition,
    debug = false
): RouteAccessInfo {
    // `debug` disables analysis per Phase 2 contract and forces the safe
    // "all fields used" default (ROADMAP-phase2 §6.3.1).
    if (debug) {
        return freezeRouteAccessInfo([], /* unknown */ true);
    }

    try {
        // Concatenate the source of every handler and route middleware.
        let source = '';
        const handlers = def.handlers ?? {};
        for (const key of Object.keys(handlers)) {
            source += '\n' + safeToString(handlers[key]);
        }
        const middleware = def.middleware ?? [];
        for (let i = 0; i < middleware.length; i++) {
            source += '\n' + safeToString(middleware[i]);
        }

        // Strip comments before scanning so commented-out fields don't count.
        source = stripComments(source);

        // Ambiguous access we cannot resolve → safe "all fields used" default.
        if (isAmbiguous(source)) {
            return freezeRouteAccessInfo([], /* unknown */ true);
        }

        const accessed: ContextField[] = [];
        for (let i = 0; i < FIELD_KEYS.length; i++) {
            const field = FIELD_KEYS[i];
            if (referencesField(source, field)) {
                accessed.push(field);
            }
        }

        return freezeRouteAccessInfo(accessed, /* unknown */ false);
    } catch {
        // Safe default: empty set, `unknown: true` → `has()` returns true for
        // every field. Cannot affect runtime correctness.
        return freezeRouteAccessInfo([], /* unknown */ true);
    }
}
