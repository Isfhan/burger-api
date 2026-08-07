/**
 * The Zod adapter — the default schema provider for BurgerAPI.
 *
 * Responsibilities:
 * - Compute a stable identity for a Zod schema.
 * - Compile a Zod schema into a reusable `CompiledValidator`.
 * - Normalize Zod `issues` into the common `ValidationIssue[]` shape.
 *
 * This adapter must NOT own Zod's validation semantics (it delegates to
 * `safeParse`) and must NOT own coercion (that is the coercer's role).
 */

import { z } from 'zod';
import type {
    SchemaInput,
    ValidationSlot,
    CompiledValidator,
    ValidationResult,
    ValidationIssue,
} from '../types';
import type { ValidatorAdapter } from '../adapter';

/** Maps a Zod issue path to the normalized `(string | number)[]`. */
function normalizePath(path: (string | number)[]): (string | number)[] {
    return path.map((p) => (typeof p === 'bigint' ? Number(p) : p));
}

/** Normalizes Zod's `ZodError.issues` into `ValidationIssue[]`. */
function normalizeIssues(error: z.ZodError): ValidationIssue[] {
    return error.issues.map((issue) => ({
        path: normalizePath(issue.path as (string | number)[]),
        message: issue.message,
        code: issue.code,
    }));
}

export const ZodAdapter: ValidatorAdapter = {
    identity(schema: SchemaInput): string {
        // Zod v4's `toString()` is not stable for object schemas, so use a
        // deterministic JSON Schema fingerprint as the structural identity
        // Prefix to namespace under the Zod provider.
        const zodSchema = schema as z.ZodTypeAny;
        let fingerprint: string;
        try {
            fingerprint = JSON.stringify(z.toJSONSchema(zodSchema));
        } catch {
            // Fallback for schemas without JSON Schema support.
            fingerprint = String(zodSchema);
        }
        return 'zod:' + fingerprint;
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
                return { success: true, data: result.data };
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
