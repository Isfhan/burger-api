/**
 * Validation module for BurgerAPI — the Validation 2.0 surface.
 *
 * Precompiled request validation (identity-cached per schema), opt-in
 * coercion, and RFC 9457 error rendering.
 */

export { compileRouteSchema, validatorCache, clearValidatorCache } from './compiler';
export { createValidationHook } from './validator';
export {
    ValidationError,
    renderValidationError,
    toValidationErrors,
} from './error';
export type { RenderContext } from './error';
export { ValidatorCache } from './cache';
export {
    registerAdapter,
    detectAdapter,
} from './adapter';
export type { ValidatorAdapter } from './adapter';
export { buildPlan, apply } from './coerce';
export type {
    SchemaInput,
    ValidatorKind,
    ValidationSlot,
    ValidationIssue,
    ValidatorConfig,
    CompiledValidator,
    CompiledRouteValidators,
    CoercionOp,
    CoercionPlan,
    StandardSchemaV1,
    StandardSchemaV1Result,
} from './types';
