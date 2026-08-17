/**
 * The validator adapter (connector) layer — the only place that decides
 * *which* schema library a schema uses.
 *
 * Responsibilities:
 * - Define the `ValidatorAdapter` interface (produce identity + prepare).
 * - Detect which adapter a schema belongs to (Zod first, then Standard).
 * - Allow registration of additional adapters (future libraries).
 *
 * This module performs detection when the app starts only; it never runs
 * when a request comes in. It does not contain the schema-check
 * logic — that lives in each adapter implementation.
 */

import { z } from 'zod';
import type {
    SchemaInput,
    StandardSchemaV1,
    ValidationSlot,
    CompiledValidator,
} from './types';

/**
 * A stable connector between BurgerAPI's request flow and a concrete schema
 * library. The coordinator (orchestrator) and cache depend only on this
 * interface, never on a concrete library.
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
     * faithfully capture the schema's runtime semantics (e.g. refinements
     * with function checks, self-coercing schemas) — such schemas compile
     * fresh on every route.
     */
    cacheable?(schema: SchemaInput): boolean;
}

/** True when the value is a Zod schema (instance of `z.ZodType`). */
function isZod(value: unknown): value is z.ZodTypeAny {
    try {
        return value instanceof z.ZodType;
    } catch {
        return false;
    }
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

/** Registered third-party adapters (future libraries, ). */
const registered: ValidatorAdapter[] = [];
/** The Zod adapter singleton, set by the Zod adapter module on load. */
let zodAdapterInstance: ValidatorAdapter | undefined;
/** The Standard Schema adapter singleton, set by M3 on load. */
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
 * Detection order (R5): Zod brand first (default provider),
 * then any registered adapter, then the built-in Standard Schema adapter.
 * Throws on unknown schemas to fail fast at compile time —
 * never a request-time surprise.
 */
export function detectAdapter(schema: SchemaInput): ValidatorAdapter {
    if (isZod(schema) && zodAdapterInstance) {
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
