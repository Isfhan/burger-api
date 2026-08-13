/**
 * The response validator — validates a handler's return against declared
 * per-status schemas.
 *
 * Responsibilities:
 * - Select the response schema by status (exact code, then class `2xx`).
 * - Validate the response body.
 * - Apply `dev` (observe, log, pass through) vs `enforce` (safe 500/422).
 *
 * This runs as a step AFTER your handler, inside the same request flow (not a
 * separate flow, ). It is invisible to apps that declare no
 * `response` schema.
 */

import type {
    CompiledRouteValidators,
    CompiledValidator,
    ValidationResult,
    ValidatorConfig,
} from './types';
import { renderValidationError } from './error';

/** Resolves the response validator for a status (exact, then class). */
function selectResponseValidator(
    validators: CompiledRouteValidators,
    method: string,
    status: number
) {
    // The response map only has lowercase-method keys; the caller's runtime
    // method string may be any case, so index via the widened record.
    const methodResponses = (
        validators.response as
            | Record<string, Record<string, CompiledValidator> | undefined>
            | undefined
    )?.[method];
    if (!methodResponses) return undefined;
    if (methodResponses[String(status)]) return methodResponses[String(status)];
    const cls = `${Math.floor(status / 100)}xx`;
    if (methodResponses[cls]) return methodResponses[cls];
    return undefined;
}

export interface ResponseValidationOutcome {
    ok: boolean;
    /** Safe error body (no internals) when enforce fails. */
    errorResponse?: Response;
}

/**
 * Validates a handler result against the `response` schema for `status`.
 *
 * @param validators - the route's compiled validators.
 * @param status - the HTTP status of the handler response.
 * @param value - the response body value to validate.
 * @param config - the validator config (mode + enforce status).
 * @param isDev - whether to run in dev mode (observe-only).
 */
export function validateResponse(
    validators: CompiledRouteValidators,
    method: string,
    status: number,
    value: unknown,
    config: ValidatorConfig,
    isDev: boolean
): ResponseValidationOutcome {
    const validator = selectResponseValidator(validators, method, status);
    if (!validator) {
        return { ok: true };
    }

    const result: ValidationResult = validator.validate(value);

    if (result.success) {
        return { ok: true };
    }

    const mode = config.responseValidation ?? 'dev';
    if (mode === 'off') {
        return { ok: true };
    }

    if (mode === 'dev') {
        // Observe only: log and pass the handler response through untouched.
        if (isDev) {
            console.warn(
                `[burger-api] Response validation mismatch (status ${status}):`,
                result.issues
            );
        }
        return { ok: true };
    }

    // enforce: return a safe error response. Never leak schema internals.
    const enforceStatus = status === 422 ? 422 : 500;
    const errorResponse = renderValidationError(result, {
        status: enforceStatus,
        isDev,
        slot: 'response',
        config,
    });
    return { ok: false, errorResponse };
}
