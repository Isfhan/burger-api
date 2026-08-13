/**
 * Central type definitions for the validation subsystem.
 *
 * Types only — no runtime logic, no adapter (connector) implementations,
 * no I/O. Keeps the public `types/index.ts` clean.
 */

import type { z } from 'zod';
import type { LowercaseHTTPMethod } from '../utils/routing';

/**
 * Minimal structural type for a Standard Schema V1 validator — the common
 * shape shared by libraries like Valibot and ArkType so they can work with
 * BurgerAPI. No new dependency — only the stable `~standard` contract is
 * used. The `vendor` names the producing library
 * (e.g. "valibot", "arktype", "zod").
 */
export interface StandardSchemaV1 {
    readonly '~standard': {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (
            value: unknown
        ) => StandardSchemaV1Result | Promise<StandardSchemaV1Result>;
        /** True when the schema transforms (coerces) its input during validate. */
        readonly coercible?: boolean;
        readonly types?: {
            readonly input?: unknown;
            readonly output?: unknown;
        };
    };
}

export interface StandardSchemaV1Result {
    readonly value: unknown;
    readonly issues?: ReadonlyArray<StandardSchemaV1Issue>;
}

export interface StandardSchemaV1Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

/**
 * Any value accepted in a schema slot. Zod remains the default provider;
 * Standard Schema libraries are also accepted through the adapter (connector)
 * layer.
 */
export type SchemaInput = z.ZodTypeAny | StandardSchemaV1;

/** The five request slots that can carry a schema. */
export type ValidationSlot =
    'params' | 'query' | 'headers' | 'cookies' | 'body';

/** The kinds of validator providers known to the adapter (connector) layer. */
export type ValidatorKind = 'zod' | 'standard';

/**
 * A common result shape shared by every adapter (connector) so that Zod and
 * other libraries all report success or failures the same way.
 */
export type ValidationResult =
    | { success: true; data: unknown }
    | { success: false; issues: ValidationIssue[] };

/**
 * A single field-level failure.
 */
export interface ValidationIssue {
    path: (string | number)[];
    message: string;
    code?: string;
}

/**
 * The runtime unit produced when a schema is prepared: one reusable
 * `validate` call plus metadata. Prepared once per unique identity before
 * `serve()`. The `modelRef`, when present, records the resolved model name
 * so future optimizations can reuse it.
 */
export interface CompiledValidator {
    kind: ValidatorKind;
    slot: ValidationSlot;
    identity: string;
    validate: (value: unknown) => ValidationResult;
    /**
     * True when the schema transforms (coerces) its own input during
     * `validate` (e.g. Zod `z.coerce.*`, Valibot `v.coerce`, or a
     * `~standard.coercible` schema). Framework coercion must be skipped for
     * such schemas — pre-coercing a self-coercing schema would double-apply
     * type conversion. False for strict schemas (framework coercion applies).
     */
    coercible: boolean;
    /** Present when this validator was produced from a model ref. */
    modelRef?: string;
}

/** Coercion operations supported by the coercer. */
export type CoercionOp = 'number' | 'boolean' | 'date' | 'none';

/**
 * A per-slot, per-field plan built when the route is set up. Applied at
 * runtime with no extra checks on each request.
 */
export interface CoercionPlan {
    slot: 'query' | 'params' | 'headers' | 'cookies';
    fields: Record<string, CoercionOp>;
}

/**
 * Per-status-code map of response validators.
 */
export type ResponseSchema = Record<string, SchemaInput>;

/**
 * Configuration surfaced from `ServerOptions` into the compilation step.
 * Defaults match the BurgerAPI Vision:
 * - status: 422
 * - errorFormat: 'problem+json' (RFC 9457)
 * - responseValidation: 'dev'
 */
export interface ValidatorConfig {
    /** Opt-in string→type coercion. Default false. */
    coerce?: boolean;
    /** Response validation mode. Default 'dev'. */
    responseValidation?: 'off' | 'dev' | 'enforce';
    /** Error body shape. Default 'problem+json' (RFC 9457). */
    errorFormat?: 'plain' | 'problem+json';
    /** Default HTTP status for validation errors. Default 422. */
    status?: number;
    /** Custom renderer that fully controls the error body. */
    errorRenderer?: (
        result: ValidationResult,
        ctx: {
            slot?: ValidationSlot | 'response';
            status: number;
        }
    ) => Response;
}

/**
 * The per-route bundle of prepared slot validators + conversion plans +
 * response validators, attached to the route when it is prepared.
 * Method keys are lowercase (the form the compiler emits and the validator
 * looks up at request time).
 */
export interface CompiledRouteValidators {
    methods: Partial<
        Record<
            LowercaseHTTPMethod,
            {
                params?: CompiledValidator;
                query?: CompiledValidator;
                headers?: CompiledValidator;
                cookies?: CompiledValidator;
                body?: CompiledValidator;
                coercion?: {
                    query?: CoercionPlan;
                    params?: CoercionPlan;
                    headers?: CoercionPlan;
                    cookies?: CoercionPlan;
                };
            }
        >
    >;
    /** Per-method, per-status-code map of response validators. */
    response?: Partial<
        Record<LowercaseHTTPMethod, Record<string, CompiledValidator>>
    >;
}
