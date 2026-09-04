/**
 * Validation module for BurgerAPI — the Validation 2.0 surface.
 *
 * Precompiled request validation (identity-cached per schema), opt-in
 * coercion, and RFC 9457 error rendering.
 */

export { compileRouteSchema, validatorCache, clearValidatorCache } from './compiler.js';
export { createValidationHook } from './validator.js';
export {
    ValidationError,
    renderValidationError,
    toValidationErrors,
} from './error.js';
export type { RenderContext } from './error.js';
export { ValidatorCache } from './cache.js';
export {
    registerAdapter,
    detectAdapter,
} from './adapter.js';
// Schema input types — `compileRouteSchema` consumes exactly these, so
// subpath users don't need the root import to type their schemas.
export type { MethodSchema, RouteSchema } from '../types/index.js';
export type { ValidatorAdapter } from './adapter.js';
export { buildPlan, apply } from './coerce.js';
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
} from './types.js';
