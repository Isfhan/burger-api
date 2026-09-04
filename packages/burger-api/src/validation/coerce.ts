/**
 * The coercer — builds and applies precomputed value-conversion plans
 *. "Coercion" here means automatic type conversion:
 * turning a string like `"42"` into the number `42`, or `"true"` into the
 * boolean `true`.
 *
 * Responsibilities:
 * - `buildPlan`: inspect a schema slot and record only the fields that need
 * conversion (number/boolean/date). Returns undefined when there is nothing
 * to convert.
 * - `apply`: transform a raw string record into a typed record using the plan,
 * in a single linear pass. Fields not in the plan are copied unchanged (no
 * extra checks on them).
 *
 * Conversion is OPT-IN (default OFF, ). The plan is built once when
 * the app starts; applied per request only when present. It must NOT run when
 * conversion is disabled, must NOT convert the body, and must NOT leak `NaN`
 * (a bad conversion simply fails later in the validator, ).
 */

import { z } from 'zod';
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
            // Infinity or NaN. Anything else stays a string so the
            // downstream validator reports the real input.
            if (!/^\s*[+-]?\d+(\.\d+)?\s*$/.test(raw)) {
                return raw;
            }
            const n = Number(raw);
            // A failed conversion (e.g. "abc") yields NaN. Keep the original
            // raw string instead so the downstream validator reports the
            // actual bad input ("received 'abc'") rather than a confusing
            // "received nan".
            return Number.isNaN(n) ? raw : n;
        }
        case 'boolean': {
            if (raw === 'true') return true;
            if (raw === 'false') return false;
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
    if (!(slotSchema instanceof z.ZodType)) return undefined;
    const shape = (slotSchema as z.ZodObject<any, any>).shape;
    if (!shape || typeof shape !== 'object') return undefined;

    const fields: Record<string, CoercionOp> = {};
    for (const key of Object.keys(shape)) {
        const op = opForZodField(shape[key]);
        if (op !== 'none') fields[key] = op;
    }

    if (Object.keys(fields).length === 0) return undefined;
    return { slot, fields };
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
        if (!op) {
            out[key] = value;
            continue;
        }
        // Arrays (duplicate keys) are not coerced field-by-field; pass through
        // so the validator sees the same shape as today.
        if (Array.isArray(value)) {
            out[key] = value;
            continue;
        }
        out[key] = coerceValue(op, value as string);
    }
    return out;
}
