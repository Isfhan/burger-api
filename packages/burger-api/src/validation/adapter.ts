/**
 * The validator adapter layer — the only place that decides which schema
 * library a schema uses.
 *
 * Defines the `ValidatorAdapter` interface, detects which adapter a schema
 * belongs to (Zod first, then Standard), and allows registering additional
 * adapters. Detection runs when the app starts only; never when a request
 * comes in. Schema-check logic lives in each adapter implementation.
 */

import { z } from 'zod';
import type {
    SchemaInput,
    StandardSchemaV1,
    ValidationSlot,
    CompiledValidator,
} from './types.js';

/**
 * A stable connector between BurgerAPI's request flow and a concrete schema
 * library. The coordinator and cache depend only on this interface, never on
 * a concrete library.
 */
export interface ValidatorAdapter {
    /** Stable identity for a schema; drives cache sharing. */
    identity(schema: SchemaInput): string;
    /**
     * Prepare a schema slot into a reusable `CompiledValidator`. The
     * `validate` call is the sole runtime entry point.
     */
    compile(schema: SchemaInput, slot: ValidationSlot): CompiledValidator;
    /** Whether this adapter can handle the given schema. */
    supports(schema: SchemaInput): boolean;
    /**
     * Whether a compiled validator for this schema is safe to cache and
     * share. Adapters return false when the structural identity cannot
     * capture the schema's runtime semantics (e.g. refinements with function
     * checks, self-coercing schemas) — such schemas compile fresh per route.
     */
    cacheable?(schema: SchemaInput): boolean;
}

/**
 * True when the value is a Zod 4 schema. Detection is structural — the `_zod`
 * internals marker — so schemas from a second zod copy (a duplicate install)
 * are recognized too, not only instances of this package's `z.ZodType`.
 */
export function isZodSchema(value: unknown): value is z.ZodTypeAny {
    if (typeof value !== 'object' || value === null) return false;
    const internals = (value as { _zod?: unknown })._zod;
    return typeof internals === 'object' && internals !== null;
}

/** True when the value carries the Standard Schema v1 `~standard` contract. */
function isStandardSchema(value: unknown): value is StandardSchemaV1 {
    return (
        typeof value === 'object' &&
        value !== null &&
        '~standard' in value &&
        typeof (value as StandardSchemaV1)['~standard']?.validate === 'function'
    );
}

/** Registered additional adapters (checked after the built-in Zod check). */
const registered: ValidatorAdapter[] = [];
/** The Zod adapter singleton, set by the Zod adapter module on load. */
let zodAdapterInstance: ValidatorAdapter | undefined;
/** The Standard Schema adapter singleton, set on load. */
let standardAdapterInstance: ValidatorAdapter | undefined;

/** The Zod adapter registers itself here at module load. */
export function __setZodAdapter(adapter: ValidatorAdapter): void {
    zodAdapterInstance = adapter;
}

/** The Standard Schema adapter registers itself here at module load. */
export function __setStandardAdapter(adapter: ValidatorAdapter): void {
    standardAdapterInstance = adapter;
}

/** Register an additional adapter (checked after the built-in Zod check). */
export function registerAdapter(adapter: ValidatorAdapter): void {
    registered.push(adapter);
}

/**
 * Returns the adapter that should handle `schema`.
 *
 * Detection order: Zod brand first (default provider), then any registered
 * adapter, then the built-in Standard Schema adapter. Throws on unknown
 * schemas to fail fast at compile time — never a request-time surprise.
 */
export function detectAdapter(schema: SchemaInput): ValidatorAdapter {
    if (isZodSchema(schema) && zodAdapterInstance) {
        return zodAdapterInstance;
    }
    for (const adapter of registered) {
        if (adapter.supports(schema)) return adapter;
    }
    if (isStandardSchema(schema) && standardAdapterInstance) {
        return standardAdapterInstance;
    }
    if (isStandardSchema(schema)) {
        throw new Error(
            '[burger-api] Standard Schema adapter is not loaded. ' +
                'This is an internal wiring error (Standard Schema adapter missing).'
        );
    }
    throw new Error(
        '[burger-api] Unsupported schema: not a Zod schema and not a ' +
            'Standard Schema (missing "~standard" contract). ' +
            'Wrap the value with a supported provider.'
    );
}
