/**
 * The validation error system — structured `ValidationError` + mode-gated
 * renderers (phase3 §12.10, §10).
 *
 * Responsibilities:
 * - Put issues into a common `ValidationError` shape.
 * - Render a response body: `plain` (default) or `problem+json` *shape*
 *   (path/message only; the full RFC 9457 `detail`/`instance` fields are
 *   reserved for Phase 6).
 * - Mode-gate: dev shows full issues; production strips internals.
 * - Honor a custom `errorRenderer` override (phase3 §10.4).
 *
 * Production bodies never leak stacks/source/schema internals (phase3 §18 R7).
 * The `problem+json` renderer emits only the shape — `detail`/`instance` are
 * intentionally omitted here (Phase 6 owns them).
 */

import type { ValidationIssue, ValidationResult, ValidatorConfig } from './types';

/** A structured validation error carrying the slot and normalized issues. */
export interface ValidationError {
    slot: string;
    issues: ValidationIssue[];
}

/** Flattens a `ValidationResult` failure into per-slot `ValidationError`s. */
export function toValidationErrors(
    result: ValidationResult,
    slot: string
): ValidationError[] {
    if (result.success) return [];
    return [{ slot, issues: result.issues }];
}

export interface RenderContext {
    status: number;
    /** Whether to include dev diagnostics (stack/path detail). */
    isDev: boolean;
    /** The slot that produced the error (request) or 'response' (enforce). */
    slot?: string;
    /** Per-slot issues for request validation (all failing slots). When
     *  present, the plain renderer emits one key per slot instead of
     *  collapsing every issue under a single slot name. */
    errorsBySlot?: Record<string, ValidationIssue[]>;
    /** The validator config (mode + custom renderer). */
    config: ValidatorConfig;
}

/**
 * Renders a failed `ValidationResult` into a `Response`.
 *
 * - Custom `errorRenderer` (if provided) fully controls the body.
 * - `problem+json` format emits the RFC 9457 *shape* (path/message only).
 * - `plain` (default) emits `{ errors: { slot: issues } }`.
 * - In production, only `path`/`message` (and `code`) are emitted — no
 *   stacks, source paths, or schema internals (phase3 §18 R7).
 */
export function renderValidationError(
    result: ValidationResult,
    ctx: RenderContext
): Response {
    if (result.success) {
        // This renderer is only ever called with a failed result. A success
        // reaching here means a caller misuse (e.g. passing a successful
        // validation to be rendered as an error) — surface it loudly rather
        // than returning a misleading 200.
        throw new Error(
            '[burger-api] renderValidationError called with a successful ' +
                'validation result; it only renders failures.'
        );
    }

    if (ctx.config.errorRenderer) {
        return ctx.config.errorRenderer(result, {
            slot: ctx.slot as any,
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

    // Default plain format. In production we strip nothing sensitive beyond
    // what is already in the normalized issue (path/message/code).
    const body: Record<string, unknown> = {
        errors: ctx.errorsBySlot
            ? ctx.errorsBySlot
            : ctx.slot
              ? { [ctx.slot]: issues }
              : { message: issues[0]?.message ?? 'Validation failed' },
    };
    if (ctx.isDev) {
        // Dev may include the raw code for easier debugging.
        (body as any).dev = true;
    }
    return new Response(JSON.stringify(body), {
        status: ctx.status,
        headers: { 'content-type': 'application/json' },
    });
}
