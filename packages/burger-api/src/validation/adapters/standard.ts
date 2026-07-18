/**
 * The Standard Schema adapter — brings Valibot/ArkType/`~standard` libraries
 * into BurgerAPI with no framework change (phase3 §12.4, §6).
 *
 * Responsibilities:
 * - Compute a stable identity from the `~standard` contract (vendor + shape).
 * - Compile into a `CompiledValidator` whose `validate` calls
 *   `schema['~standard'].validate` and normalizes the result into the common
 *   `ValidationResult` shape.
 *
 * This adapter must NOT assume a specific library — it depends only on the
 * `~standard` contract (phase3 §6.10). It registers itself with the detection
 * seam on load.
 */

import { __setStandardAdapter, type ValidatorAdapter } from '../adapter';
import type {
    SchemaInput,
    StandardSchemaV1,
    StandardSchemaV1Issue,
    ValidationSlot,
    CompiledValidator,
    ValidationResult,
    ValidationIssue,
} from '../types';

/** Flattens a Standard Schema issue path into `(string | number)[]`. */
function normalizePath(
    path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
): (string | number)[] {
    if (!path) return [];
    return path.map((p) =>
        typeof p === 'object' && p !== null && 'key' in p
            ? (p.key as string | number)
            : (p as string | number)
    );
}

function normalizeIssues(issues: ReadonlyArray<StandardSchemaV1Issue>): ValidationIssue[] {
    return issues.map((issue) => ({
        path: normalizePath(issue.path),
        message: issue.message,
    }));
}

export const StandardAdapter: ValidatorAdapter = {
    identity(schema: SchemaInput): string {
        const std = schema as StandardSchemaV1;
        const vendor = std['~standard'].vendor ?? 'unknown';
        // Structural fingerprint from the JSON-ish shape of the standard
        // result types (phase3 D2). Use the vendor + a stable stringification.
        let fingerprint: string;
        try {
            const types = std['~standard'].types;
            fingerprint = JSON.stringify(types ?? String(std));
        } catch {
            fingerprint = String(std);
        }
        return 'standard:' + vendor + ':' + fingerprint;
    },

    supports(schema: SchemaInput): boolean {
        return (
            typeof schema === 'object' &&
            schema !== null &&
            '~standard' in schema &&
            typeof (schema as StandardSchemaV1)['~standard']?.validate ===
                'function'
        );
    },

    compile(schema: SchemaInput, slot: ValidationSlot): CompiledValidator {
        const std = schema as StandardSchemaV1;
        const identity = this.identity(schema);
        // Standard Schema v1 allows `~standard.validate` to be sync or async.
        // BurgerAPI's validation pipeline is synchronous per slot, so an async
        // validator would only fail at request time. Detect it here, at
        // compile/registration time, so a bad schema fails fast at startup
        // instead of throwing a 500 on the first matching request.
        let isAsync = false;
        try {
            const probe = std['~standard'].validate(undefined);
            if (probe instanceof Promise) {
                isAsync = true;
                probe.catch(() => {});
            }
        } catch {
            // A sync throw on the probe is fine — the real call re-runs it.
        }
        if (isAsync) {
            throw new Error(
                '[burger-api] Standard Schema validator for slot "' +
                    slot +
                    '" is async (`~standard.validate` returned a Promise). ' +
                    'BurgerAPI validation is synchronous; use a sync ' +
                    '`~standard` validator for request validation.'
            );
        }
        const validate = (value: unknown): ValidationResult => {
            const result = std['~standard'].validate(value);
            if (result instanceof Promise) {
                // Defensive: should never happen after the compile-time probe,
                // but guard so we never return a Promise where a sync result is
                // expected.
                throw new Error(
                    '[burger-api] Standard Schema validator for slot "' +
                        slot +
                        '" returned a Promise at request time. Use a sync ' +
                        '`~standard` validator for request validation.'
                );
            }
            if ('issues' in result && result.issues) {
                return {
                    success: false,
                    issues: normalizeIssues(result.issues),
                };
            }
            return { success: true, data: result.value };
        };
        return {
            kind: 'standard',
            slot,
            identity,
            validate,
            coercible: false,
        };
    },
};

// Register with the detection seam so Zod-first detection can fall through
// to this adapter.
__setStandardAdapter(StandardAdapter);
