/**
 * The coercer — builds and applies precomputed value-conversion plans.
 * "Coercion" means automatic type conversion: `"42"` → the number `42`,
 * `"true"` → the boolean `true`.
 *
 * `buildPlan` records only the fields that need conversion
 * (number/boolean/date) and returns undefined when there is nothing to
 * convert. `apply` transforms a raw string record in a single linear pass;
 * fields not in the plan are copied unchanged.
 *
 * Conversion is opt-in (default OFF, planned at startup and applied only when
 * present). It never converts the body and never leaks `NaN` — a bad
 * conversion stays a string so the validator reports the real input.
 */

import { isZodSchema } from './adapter.js';
import type {
    CoercionOp,
    CoercionPlan,
    SchemaInput,
    ValidationSlot,
} from './types.js';

/** Unwraps optional/nullable/default wrappers to reach the inner type. */
function unwrap(def: unknown): unknown {
    let current = def;
    // Up to a few levels of wrapping (optional/nullable/default).
    for (let i = 0; i < 4 && current; i++) {
        const inner = (current as any)?._zod?.def?.innerType;
        if (inner === undefined) break;
        current = inner;
    }
    return current;
}

/** Returns the coercion op for a Zod field def, or 'none'. */
function opForZodField(def: unknown): CoercionOp {
    // Self-coercing fields (`z.coerce.*`, marked `_zod.def.coerce: true`)
    // transform their input during validate — never pre-coerce them.
    if ((def as any)?._zod?.def?.coerce === true) return 'none';
    const name = (def as any)?.constructor?.name;
    if (name === 'ZodNumber') return 'number';
    if (name === 'ZodBoolean') return 'boolean';
    if (name === 'ZodDate') return 'date';
    // Try unwrapping optional/nullable/default.
    const inner = unwrap(def);
    if (inner && inner !== def) return opForZodField(inner);
    return 'none';
}

function coerceValue(op: CoercionOp, raw: string): unknown {
    switch (op) {
        case 'number': {
            // Strict decimal form only: no empty/whitespace, hex, exponent,
            // Infinity or NaN. Anything else stays a string.
            if (!/^\s*[+-]?\d+(\.\d+)?\s*$/.test(raw)) {
                return raw;
            }
            const n = Number(raw);
            // Never leak NaN: keep the raw string so the validator reports
            // the actual bad input.
            return Number.isNaN(n) ? raw : n;
        }
        case 'boolean': {
            if (raw === 'true' || raw === '1') return true;
            if (raw === 'false' || raw === '0') return false;
            // Unknown boolean string -> leave as-is; the validator will reject.
            return raw;
        }
        case 'date': {
            const d = tryParseDate(raw);
            return d ?? raw;
        }
        default:
            return raw;
    }
}

/**
 * Strict ISO-8601 date parse.
 *
 * Rejects numeric strings ("42"), non-ISO formats, and impossible calendar
 * dates ("2026-02-30" rolls over in `new Date()` unless checked). Date-only
 * values are validated against the calendar directly; full timestamps must
 * carry a time and a zone.
 */
function tryParseDate(raw: string): Date | null {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (dateOnly) {
        const [, y, mo, da] = dateOnly;
        const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da)));
        if (day.toISOString().slice(0, 10) !== `${y}-${mo}-${da}`) {
            return null;
        }
        return day;
    }

    if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(
            raw
        )
    ) {
        return null;
    }

    // Full timestamp: verify the calendar day too (the parse alone would
    // roll "2026-02-30T10:00:00Z" forward).
    if (tryParseDate(raw.slice(0, 10)) === null) {
        return null;
    }

    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Builds a coercion plan for a schema slot. Returns undefined when the slot
 * has no coercible fields (so the orchestrator can skip coercion entirely).
 *
 * Currently inspects Zod object shapes (the default provider).
 * Other adapters can be extended by detecting their intent here.
 */
export function buildPlan(
    slotSchema: SchemaInput,
    slot: 'query' | 'params' | 'headers' | 'cookies'
): CoercionPlan | undefined {
    if (!isZodSchema(slotSchema)) return undefined;
    const shape = (slotSchema as { shape?: unknown }).shape;
    if (!shape || typeof shape !== 'object') return undefined;
    const fieldMap = shape as Record<string, unknown>;

    const fields: Record<string, CoercionOp> = {};
    const arrays: Record<string, CoercionOp> = {};
    for (const key of Object.keys(fieldMap)) {
        // `z.array(x)`: repeated keys (`?tag=a&tag=b`) already arrive as an
        // array; a single occurrence is wrapped. Elements use x's op.
        const inner = unwrap(fieldMap[key]) as any;
        if (inner?.constructor?.name === 'ZodArray') {
            arrays[key] = opForZodField(inner._zod?.def?.element);
            continue;
        }
        const op = opForZodField(fieldMap[key]);
        if (op !== 'none') fields[key] = op;
    }

    const hasArrays = Object.keys(arrays).length > 0;
    if (Object.keys(fields).length === 0 && !hasArrays) return undefined;
    return hasArrays ? { slot, fields, arrays } : { slot, fields };
}

/**
 * Applies a coercion plan to a raw record. Fields not in the plan are copied
 * as-is. The output is a new record; the input is not mutated.
 */
export function apply(
    plan: CoercionPlan,
    raw: Record<string, string | string[]>
): Record<string, unknown> {
    // Null prototype: input keys are attacker-controlled.
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(raw)) {
        const op = plan.fields[key];
        const value = raw[key];
        const elementOp = plan.arrays?.[key];
        if (elementOp !== undefined) {
            const list = Array.isArray(value) ? value : [value as string];
            if (elementOp === 'none') {
                out[key] = list;
                continue;
            }
            // Plain loop: element coercion runs per request, no `map` closure.
            const coerced: unknown[] = new Array(list.length);
            for (let i = 0; i < list.length; i++) {
                coerced[i] = coerceValue(elementOp, list[i]!);
            }
            out[key] = coerced;
            continue;
        }
        if (!op) {
            out[key] = value;
            continue;
        }
        // Arrays (duplicate keys) are not coerced field-by-field; pass through
        // unchanged so the validator sees the same shape.
        if (Array.isArray(value)) {
            out[key] = value;
            continue;
        }
        out[key] = coerceValue(op, value as string);
    }
    return out;
}
