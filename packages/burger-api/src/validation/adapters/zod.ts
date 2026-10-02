/**
 * The Zod adapter — the default schema provider for BurgerAPI.
 *
 * Computes a stable identity, compiles a Zod schema into a reusable
 * `CompiledValidator`, and normalizes Zod `issues` into `ValidationIssue[]`.
 * Delegates validation to `safeParse` and leaves coercion to the coercer.
 */

import { z } from 'zod';
import type {
    SchemaInput,
    ValidationSlot,
    CompiledValidator,
    ValidationResult,
    ValidationIssue,
} from '../types.js';
import type { ValidatorAdapter } from '../adapter.js';

/** Maps a Zod issue path to the normalized `(string | number)[]`. */
function normalizePath(path: (string | number)[]): (string | number)[] {
    return path.map((p) => (typeof p === 'bigint' ? Number(p) : p));
}

/** Bounded deep scan for function values inside a check descriptor. */
function hasFunctionValue(value: unknown, depth = 0): boolean {
    if (typeof value === 'function') {
        return true;
    }
    if (depth >= 4 || typeof value !== 'object' || value === null) {
        return false;
    }
    for (const v of Object.values(value as Record<string, unknown>)) {
        if (hasFunctionValue(v, depth + 1)) {
            return true;
        }
    }
    return false;
}

/** Normalizes Zod's `ZodError.issues` into `ValidationIssue[]`. */
function normalizeIssues(error: z.ZodError): ValidationIssue[] {
    return error.issues.map((issue) => ({
        path: normalizePath(issue.path as (string | number)[]),
        message: issue.message,
        code: issue.code,
    }));
}

/** Monotonic ids for schemas with no computable JSON Schema fingerprint. */
const uniqueSchemaIds = new WeakMap<object, number>();
let nextUniqueSchemaId = 0;

/**
 * Root-level wrappers whose validation semantics the JSON Schema fingerprint
 * cannot capture. `z.string().optional()` and `z.string()` serialize
 * identically, so sharing a cached validator would validate the wrong
 * schema (e.g. `undefined` rejected for an optional body).
 */
const LOSSY_ROOT_TYPES = new Set([
    'optional',
    'prefault',
    'nonoptional',
    'default',
    'catch',
    'pipe',
    'lazy',
]);

export const ZodAdapter: ValidatorAdapter = {
    identity(schema: SchemaInput): string {
        // Zod v4's `toString()` is not stable for object schemas, so use a
        // deterministic JSON Schema fingerprint as the structural identity.
        // Prefix it to namespace under the Zod provider.
        const zodSchema = schema as z.ZodTypeAny;
        let fingerprint: string;
        try {
            fingerprint = JSON.stringify(z.toJSONSchema(zodSchema));
        } catch {
            // No computable fingerprint (transforms, dates, custom, bigint):
            // key by object identity so distinct schemas can never share.
            let id = uniqueSchemaIds.get(zodSchema);
            if (id === undefined) {
                id = ++nextUniqueSchemaId;
                uniqueSchemaIds.set(zodSchema, id);
            }
            return 'zod:object:' + id;
        }
        return 'zod:' + fingerprint;
    },

    cacheable(schema: SchemaInput): boolean {
        const zodSchema = schema as z.ZodTypeAny;
        const def = (
            zodSchema as unknown as {
                _zod?: {
                    def?: {
                        type?: string;
                        coerce?: boolean;
                        checks?: unknown[];
                    };
                };
            }
        )._zod?.def;

        // Self-coercing schemas (z.coerce.*) validate differently than their
        // plain counterparts even though their JSON Schema fingerprints are
        // identical — never let one route's coercion leak into another's.
        if (def?.coerce === true) {
            return false;
        }

        // Root wrappers invisible to the fingerprint (optional/default/pipe/
        // …) change what counts as valid input — compile fresh.
        if (def?.type !== undefined && LOSSY_ROOT_TYPES.has(def.type)) {
            return false;
        }

        // Function-valued checks (refinements) are invisible to the JSON
        // Schema fingerprint, so structurally identical refinements would
        // collide in the cache. Compile them fresh instead.
        const checks = def?.checks;
        if (Array.isArray(checks) && checks.some((c) => hasFunctionValue(c))) {
            return false;
        }

        return true;
    },

    supports(schema: SchemaInput): boolean {
        return schema instanceof z.ZodType;
    },

    compile(schema: SchemaInput, slot: ValidationSlot): CompiledValidator {
        const zodSchema = schema as z.ZodTypeAny;
        const identity = this.identity(schema);
        // Zod 4 marks self-coercing schemas (`z.coerce.*`) with
        // `_zod.def.coerce === true`. Such schemas transform their input
        // during validate, so framework coercion must not run on them.
        const coercible =
            (zodSchema as unknown as { _zod?: { def?: { coerce?: boolean } } })
                ?._zod?.def?.coerce === true;
        const validate = (value: unknown): ValidationResult => {
            const result = zodSchema.safeParse(value);
            if (result.success) {
                // Zod's success result already has the `{ success, data }` shape —
                // return it directly instead of re-wrapping.
                return result as unknown as ValidationResult;
            }
            return { success: false, issues: normalizeIssues(result.error) };
        };
        return {
            kind: 'zod',
            slot,
            identity,
            validate,
            coercible,
        };
    },
};
