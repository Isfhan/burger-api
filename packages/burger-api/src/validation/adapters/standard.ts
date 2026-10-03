/**
 * The Standard Schema adapter — supports Valibot/ArkType/`~standard`
 * libraries with no framework change.
 *
 * Computes identity from the `~standard` contract and compiles into a
 * `CompiledValidator` whose `validate` calls `schema['~standard'].validate`
 * and normalizes the result into the common `ValidationResult` shape. Depends
 * only on the `~standard` contract, never on a specific library.
 */

import type { ValidatorAdapter } from '../adapter.js';
import type {
    SchemaInput,
    StandardSchemaV1,
    StandardSchemaV1Issue,
    ValidationSlot,
    CompiledValidator,
    ValidationResult,
    ValidationIssue,
} from '../types.js';

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

function normalizeIssues(
    issues: ReadonlyArray<StandardSchemaV1Issue>
): ValidationIssue[] {
    return issues.map((issue) => ({
        path: normalizePath(issue.path),
        message: issue.message,
    }));
}

export const StandardAdapter: ValidatorAdapter = {
    identity(schema: SchemaInput): string {
        const std = schema as StandardSchemaV1;
        const vendor = std['~standard'].vendor ?? 'unknown';
        // Fingerprint from the `~standard.types`, falling back to a stable
        // stringification of the schema.
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

    /**
     * Standard Schema vendors expose no reliable structural identity —
     * `~standard.types` often serializes the same for different schemas, so
     * cache sharing could validate a slot with the WRONG schema (silently
     * stripping fields). Correctness first: always compile fresh; the cost is
     * trivial.
     */
    cacheable(): boolean {
        return false;
    },

    compile(schema: SchemaInput, slot: ValidationSlot): CompiledValidator {
        const std = schema as StandardSchemaV1;
        const identity = this.identity(schema);
        // `~standard.validate` may be sync or async; the pipeline validates
        // synchronously per slot. Probe here so a bad schema fails fast at
        // startup instead of throwing a 500 on the first matching request.
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
            // `~standard.coercible` marks schemas that transform their own input
            // during validate — framework coercion must not run on them.
            coercible: std['~standard'].coercible === true,
        };
    },
};
