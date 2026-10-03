import type { ContextField, RouteAccessInfo } from '../context/types.js';
import type { RouteDefinition } from '../types/index.js';
import { freezeRouteAccessInfo } from '../context/route-access.js';

/**
 * `RouteAccessAnalyzer` — an optional, compile-time-only static analyzer.
 *
 * Inspects a route's handler + hook source (`Function.prototype.toString()`)
 * and returns a frozen `RouteAccessInfo` hint of which `BurgerContext` fields
 * the route touches. Any failure degrades to the safe "unknown" default
 * (every field treated as used), so a wrong verdict can never hide a field
 * the route actually reads.
 *
 * A "known" result requires every function's first parameter to be a plain
 * identifier used only as direct member access (`ctx.field` / `ctx['field']`),
 * never bare (`helper(ctx)`, `...ctx`). `debug: true` skips analysis.
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

const HOOK_STAGES = [
    'beforeRoute',
    'afterRoute',
    'mapResponse',
    'onError',
] as const;

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
    const bracket = new RegExp(`\\[\\s*['"]\\s*${field}\\s*['"]\\s*\\]`);
    return dot.test(source) || bracket.test(source);
}

function safeToString(fn: unknown): string {
    try {
        return typeof fn === 'function' ? fn.toString() : '';
    } catch {
        return '';
    }
}

const ARROW_PARAMS =
    /^(?:async\s+)?(?:\(([^()]*)\)|([\w$]+))\s*=>/;
const FUNCTION_PARAMS =
    /^(?:async\s+)?function(?:\s+[\w$]+)?\s*\(([^()]*)\)/;
const METHOD_PARAMS = /^(?:async\s+)?(?:[\w$]+)\s*\(([^()]*)\)\s*\{/;
const FIRST_IDENTIFIER = /[\w$]+/;

/**
 * Conservative patterns kept as an extra gate: they catch aliasing of a
 * context variable that was never a parameter (a closure captured in
 * another module, or `req` referenced without being declared locally).
 */
function isLegacyAmbiguous(source: string): boolean {
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
 * Scans ONE function's source and records the fields it reads. Returns `false`
 * when the function cannot be proven safe to specialize (context escapes,
 * destructured parameter, unrecognized source shape, native code), in which
 * case the caller marks the whole route `unknown`.
 */
function scanFunction(
    fn: unknown,
    accessed: Set<ContextField>
): boolean {
    const literal = stripComments(safeToString(fn));
    if (literal === '') return true;
    if (literal.includes('[native code]')) return false;

    let params: string | undefined;
    let bodyStart = -1;
    const arrow = ARROW_PARAMS.exec(literal);
    if (arrow) {
        params = arrow[1] ?? arrow[2] ?? '';
        bodyStart = arrow[0].length;
    } else {
        const fnMatch = FUNCTION_PARAMS.exec(literal);
        if (fnMatch) {
            params = fnMatch[1] ?? '';
            bodyStart = literal.indexOf('{', fnMatch[0].length);
        } else {
            const methodMatch = METHOD_PARAMS.exec(literal);
            if (methodMatch) {
                params = methodMatch[1] ?? '';
                bodyStart = literal.indexOf('{', methodMatch[0].length - 1);
            }
        }
    }
    if (params === undefined || bodyStart === -1) return false;

    const trimmedParams = params.trim();
    // Destructured / rest / default-value parameter patterns hide which
    // locals map to context fields — cannot be proven.
    if (
        trimmedParams.includes('{') ||
        trimmedParams.includes('[') ||
        trimmedParams.includes('...') ||
        trimmedParams.includes('=')
    ) {
        return false;
    }

    const body = literal.slice(bodyStart);
    const nameMatch = FIRST_IDENTIFIER.exec(trimmedParams);
    if (nameMatch) {
        const name = nameMatch[0];
        const nameRe = new RegExp(`\\b${name}\\b`, 'g');
        let occurrence: RegExpExecArray | null;
        while ((occurrence = nameRe.exec(body)) !== null) {
            let i = occurrence.index + name.length;
            // Skip whitespace between the identifier and the next token.
            while (
                i < body.length &&
                (body[i] === ' ' ||
                    body[i] === '\t' ||
                    body[i] === '\n' ||
                    body[i] === '\r')
            ) {
                i++;
            }
            const next = body[i];
            if (next === '.') continue; // ctx.field
            if (next === '?') {
                // ctx?.field — only a clean optional member access is safe.
                let j = i + 1;
                while (j < body.length && body[j] === ' ') j++;
                if (body[j] === '.') continue;
                return false;
            }
            if (next === '[') {
                // ctx['field'] is fine; a computed key is not provable.
                let j = i + 1;
                while (j < body.length && body[j] === ' ') j++;
                const quote = body[j];
                if (quote === "'" || quote === '"' || quote === '`') continue;
                return false;
            }
            // Bare occurrence: the context escaped (helper call, assignment,
            // return, spread, comparison, …) — cannot be proven.
            return false;
        }
    }

    for (let i = 0; i < FIELD_KEYS.length; i++) {
        const field = FIELD_KEYS[i]!;
        if (referencesField(body, field)) {
            accessed.add(field);
        }
    }
    return true;
}

/**
 * Analyzes one route definition and returns a frozen `RouteAccessInfo`.
 *
 * `extraSources` are functions that run for this route but are not part of
 * the definition (plugin hooks, app-level hooks, transform factories); they
 * are scanned so a "known" result accounts for every framework-known reader.
 */
export function analyzeRouteAccess(
    def: RouteDefinition,
    debug = false,
    extraSources: unknown[] = []
): RouteAccessInfo {
    // detect hook stages before debug/field analysis so hooks are
    // always recorded even in debug mode or when field analysis is skipped.
    const usedHooks: string[] = [];
    const hooks = def.hooks;
    if (hooks) {
        for (let i = 0; i < HOOK_STAGES.length; i++) {
            const stage = HOOK_STAGES[i]!;
            const val = (hooks as Record<string, unknown>)[stage];
            if (val !== undefined) {
                usedHooks.push(stage);
            }
        }
    }

    // `debug` disables analysis per contract and forces the safe
    // "all fields used" default when analysis cannot resolve fields.
    if (debug) {
        return freezeRouteAccessInfo([], /* unknown */ true, usedHooks);
    }

    try {
        const accessed = new Set<ContextField>();
        let safe = true;

        const scan = (value: unknown, depth = 0): void => {
            if (!safe || depth > 2) return;
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    if (!scanFunction(value[i], accessed)) {
                        safe = false;
                        return;
                    }
                }
                return;
            }
            if (typeof value === 'function') {
                if (!scanFunction(value, accessed)) safe = false;
                return;
            }
            // Plain objects (the `transform` factory map) — scan each factory.
            if (
                typeof value === 'object' &&
                value !== null &&
                (value as object).constructor === Object
            ) {
                const record = value as Record<string, unknown>;
                for (const key of Object.keys(record)) {
                    scan(record[key], depth + 1);
                    if (!safe) return;
                }
            }
        };

        // Handler keys are a runtime string (module exports); the map type is
        // union-keyed, so widen for iteration.
        const handlers = (def.handlers ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(handlers)) {
            scan(handlers[key] as unknown);
        }

        // Route hooks (`hooks.ts`): stage arrays, single hooks, transform map.
        if (hooks) {
            const hookValues = Object.values(hooks);
            for (let i = 0; i < hookValues.length; i++) {
                scan(hookValues[i]);
            }
        }

        // Plugin / app-level hooks and transform factories.
        for (let i = 0; i < extraSources.length && safe; i++) {
            scan(extraSources[i]);
        }

        if (!safe) {
            return freezeRouteAccessInfo([], /* unknown */ true, usedHooks);
        }

        // Aliasing patterns: an extra conservative gate for context
        // variables that are not parameters (`req` closures, ...).
        let source = '';
        for (const key of Object.keys(handlers)) {
            source += '\n' + safeToString(handlers[key]);
        }
        if (hooks) {
            const hookValues = Object.values(hooks);
            for (let i = 0; i < hookValues.length; i++) {
                const h = hookValues[i];
                if (Array.isArray(h)) {
                    for (let j = 0; j < h.length; j++) {
                        source += '\n' + safeToString(h[j]);
                    }
                } else if (typeof h === 'function') {
                    source += '\n' + safeToString(h);
                }
            }
        }
        if (isLegacyAmbiguous(stripComments(source))) {
            return freezeRouteAccessInfo([], /* unknown */ true, usedHooks);
        }

        return freezeRouteAccessInfo(accessed, /* unknown */ false, usedHooks);
    } catch {
        // Safe default: empty set, `unknown: true` → `has()` returns true for
        // every field. Cannot affect runtime correctness.
        return freezeRouteAccessInfo([], /* unknown */ true, usedHooks);
    }
}
