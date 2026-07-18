/**
 * @deprecated The validation middleware is now produced by
 * `createValidatorMiddleware` in `validation/validator.ts`, which consumes
 * precompiled validators. This shim is kept for one release to avoid breaking
 * external imports; it will be removed in a later minor (phase3 §17.3, D8).
 */
import { createValidatorMiddleware } from '../validation/validator';
import { compileRouteSchema } from '../validation/compiler';
import type { RouteSchema, Middleware } from '../types/index';

/** Deprecated alias. Use `createValidatorMiddleware` + `compileRouteSchema`. */
export function createValidationMiddleware(schema: RouteSchema): Middleware {
    return createValidatorMiddleware(compileRouteSchema(schema));
}
