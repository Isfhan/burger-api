/**
 * The validation error system — structured `ValidationError` + mode-gated
 * renderers.
 *
 * `ValidationError` extends `HTTPError` (status 422) and carries structured
 * `ValidationIssue[]` per slot. Renders RFC 9457 Problem Details by default;
 * dev shows full issues, production strips internals. A custom
 * `errorRenderer` overrides rendering. Production bodies never leak stacks or
 * schema internals.
 */

import { HTTPError, renderHTTPError } from '../errors/http-error.js';
import type {
    ValidationIssue,
    ValidationResult,
    ValidatorConfig,
    ValidationSlot,
} from './types.js';

/**
 * A structured validation error thrown when request validation fails.
 *
 * Extends `HTTPError` with status 422. Carries the failing slot and
 * normalized issues. Enters the `onError` pipeline; if no user hook
 * handles it, the framework renders an RFC 9457 response.
 */
export class ValidationError extends HTTPError {
    override readonly name = 'ValidationError';
    override readonly status: number;

    /** The primary request slot that failed validation. */
    readonly slot: ValidationSlot | 'response';

    /** Normalized field-level issues (all slots combined). */
    readonly issues: ValidationIssue[];

    /** Per-slot grouping of issues, when available. */
    readonly errorsBySlot?: Record<string, ValidationIssue[]>;

    constructor(
        slot: ValidationSlot | 'response',
        issues: ValidationIssue[],
        options?: ErrorOptions & {
            errorsBySlot?: Record<string, ValidationIssue[]>;
            /** Custom status code; defaults to 422 (ValidatorConfig.status). */
            status?: number;
        }
    ) {
        const summary =
            issues.length === 1
                ? issues[0]!.message
                : `${issues.length} validation errors`;
        const status = options?.status ?? 422;
        super(status, `${slot}: ${summary}`, options);
        this.status = status;
        this.slot = slot;
        this.issues = issues;
        this.errorsBySlot = options?.errorsBySlot;
    }

    /**
     * Creates a `ValidationError` from a failed `ValidationResult`.
     */
    static from(
        slot: ValidationSlot | 'response',
        result: ValidationResult
    ): ValidationError | null {
        if (result.success) return null;
        return new ValidationError(slot, result.issues);
    }

    /**
     * Renders this error into an RFC 9457 Problem Details response.
     *
     * Dev mode includes full issue details; production strips internal path
     * information. A custom `errorRenderer` takes precedence when provided.
     */
    toResponse(isDev: boolean, config: ValidatorConfig = {}): Response {
        if (config.errorRenderer) {
            return config.errorRenderer(
                { success: false, issues: this.issues },
                { slot: this.slot as ValidationSlot, status: this.status }
            );
        }

        const format = config.errorFormat ?? 'problem+json';

        // Use stored errorsBySlot if available, otherwise group by this.slot.
        const grouped = this.errorsBySlot ?? { [this.slot]: this.issues };

        if (format === 'problem+json') {
            // Delegate to the single RFC 9457 renderer so ValidationError and
            // HTTPError share one body shape (this adds the standard `detail`
            // member alongside the per-slot `errors` grouping).
            return renderHTTPError(this, isDev, {
                title: 'Validation Error',
                errors: grouped,
            });
        }

        // Plain format fallback.
        const body: Record<string, unknown> = { errors: grouped };
        if (isDev) {
            (body as any).dev = true;
        }
        return new Response(JSON.stringify(body), {
            status: this.status,
            headers: { 'content-type': 'application/json' },
        });
    }
}

/** Flattens a `ValidationResult` failure into per-slot `ValidationError`s. */
export function toValidationErrors(
    result: ValidationResult,
    slot: string
): ValidationError[] {
    if (result.success) return [];
    return [new ValidationError(slot as ValidationSlot, result.issues)];
}

export interface RenderContext {
    status: number;
    /** Whether to include dev diagnostics (stack/path detail). */
    isDev: boolean;
    /** The slot that produced the error (request) or 'response' (enforce). */
    slot?: ValidationSlot | 'response';
    /** Per-slot issues for request validation (all failing slots). When
     * present, the plain renderer emits one key per slot instead of
     * collapsing every issue under a single slot name. */
    errorsBySlot?: Record<string, ValidationIssue[]>;
    /** The validator config (mode + custom renderer). */
    config: ValidatorConfig;
}

/**
 * Renders a failed `ValidationResult` into a `Response`.
 *
 * A custom `errorRenderer` fully controls the body. `problem+json` emits the
 * RFC 9457 shape (path/message only); `plain` emits `{ errors: { slot: issues } }`.
 * Production emits only `path`/`message` (and `code`) — no stacks, source
 * paths, or schema internals.
 */
export function renderValidationError(
    result: ValidationResult,
    ctx: RenderContext
): Response {
    if (result.success) {
        throw new Error(
            '[burger-api] renderValidationError called with a successful ' +
                'validation result; it only renders failures.'
        );
    }

    if (ctx.config.errorRenderer) {
        return ctx.config.errorRenderer(result, {
            slot: ctx.slot,
            status: ctx.status,
        });
    }

    const issues = result.issues;

    if (ctx.config.errorFormat === 'problem+json') {
        return new Response(
            JSON.stringify({
                type: 'about:blank',
                title: 'Validation Error',
                status: ctx.status,
                detail: 'Request validation failed.',
                errors: issues.map((i) => ({
                    path: i.path,
                    message: i.message,
                })),
            }),
            {
                status: ctx.status,
                headers: { 'content-type': 'application/problem+json' },
            }
        );
    }

    // Default plain format. Only normalized issue data
    // (path/message/code) is emitted.
    const body: Record<string, unknown> = {
        errors: ctx.errorsBySlot
            ? ctx.errorsBySlot
            : ctx.slot
              ? { [ctx.slot]: issues }
              : { message: issues[0]?.message ?? 'Validation failed' },
    };
    if (ctx.isDev) {
        (body as any).dev = true;
    }
    return new Response(JSON.stringify(body), {
        status: ctx.status,
        headers: { 'content-type': 'application/json' },
    });
}
