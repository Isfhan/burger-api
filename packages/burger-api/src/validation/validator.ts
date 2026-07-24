/**
 * The validator coordinator middleware — the evolution of
 * `createValidationMiddleware` (phase3 §12.11, §13.6).
 *
 * It consumes the prepared `CompiledRouteValidators` produced by the schema
 * preparation component. When a request comes in it runs `cv.validate(value)`
 * once per slot — no walk over the raw schema, no adapter (connector)
 * selection, no preparing at request time (phase3 §15.3). It does NOT redesign
 * the middleware runner.
 *
 * Behavior mirrors the legacy middleware so existing applications behave
 * identically:
 * - skips work when `req.validated` is already set,
 * - validates params/query/body with the same checks,
 * - patches `req.json` to return the validated body,
 * - returns 400 with `{ errors }` on failure (raw issues for M2; M6 adds
 *   structured rendering).
 */

import type { BurgerContext } from '../context/context';
import type { BurgerNext } from '../types/index';
import type { Hook } from '../lifecycle/types';
import type { CompiledRouteValidators, ValidatorConfig } from './types';
import { apply as applyCoercion } from './coerce';
import { renderValidationError } from './error';

/**
 * Splits a `Cookie` header into `name=value` pairs, honoring RFC 6265 quoted
 * cookie-values. A quoted value may contain `;` or `=` without terminating the
 * pair (e.g. `session="a;b=c"`). The surrounding DQUOTES are stripped from the
 * value; the inner content is preserved verbatim.
 */
function splitCookiePairs(header: string): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    let i = 0;
    while (i < header.length) {
        // Skip leading whitespace/separators between pairs.
        while (i < header.length && (header[i] === ' ' || header[i] === ';')) i++;
        if (i >= header.length) break;

        const eq = header.indexOf('=', i);
        if (eq === -1) break; // Malformed trailing token; stop.

        const key = header.slice(i, eq).trim();
        i = eq + 1;

        let value: string;
        if (header[i] === '"') {
            // Quoted value: consume until the closing unescaped DQUOTE.
            i++; // past opening quote
            let end = i;
            while (end < header.length && header[end] !== '"') end++;
            value = header.slice(i, end);
            i = end + 1; // past closing quote
            // Advance to the next ';' (or end) so the loop skips the rest.
            const semi = header.indexOf(';', i);
            i = semi === -1 ? header.length : semi + 1;
        } else {
            const semi = header.indexOf(';', i);
            if (semi === -1) {
                value = header.slice(i);
                i = header.length;
            } else {
                value = header.slice(i, semi);
                i = semi + 1;
            }
        }
        if (key) pairs.push([key, value.trim()]);
    }
    return pairs;
}

/** Parses a `Cookie` header value into a flat record (phase3 §5 cookie slot). */
function parseCookies(header: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const [key, rawValue] of splitCookiePairs(header)) {
        try {
            out[key] = decodeURIComponent(rawValue);
        } catch {
            // Malformed percent-encoding (e.g. "%ZZ") — keep the raw value
            // rather than throwing inside the middleware.
            out[key] = rawValue;
        }
    }
    return out;
}

/**
 * Builds the validation middleware from precompiled route validators.
 *
 * @param validators - the compiled validators for this route (may be empty).
 * @param config - the validator config (error format / renderer / mode).
 * @param isDev - dev mode (observe-only, full diagnostics) flag.
 */
export function createValidatorMiddleware(
    validators: CompiledRouteValidators,
    config: ValidatorConfig = {},
    isDev = false
): Hook {
    return async (ctx: BurgerContext): Promise<BurgerNext> => {
        // If the request has already been validated, continue.
        if (ctx.validated) {
            return undefined;
        }

        const method = (ctx.method || 'get').toLowerCase();
        const methodValidators = validators.methods[method];
        if (!methodValidators) {
            return undefined;
        }

        const validated: Record<string, unknown> = {};

        // Lazy errors — created only when a failure occurs (legacy 99).
        let errors: {
            params?: unknown;
            query?: unknown;
            headers?: unknown;
            cookie?: unknown;
            body?: unknown;
        } | null = null;

        const coercion = methodValidators.coercion;

        // Params
        if (methodValidators.params && ctx.params) {
            // Apply coercion (if a plan exists) BEFORE validation so bad
            // coercions fail loudly (phase3 §18 R2). Only when enabled.
            const input = coercion?.params
                ? applyCoercion(coercion.params, ctx.params as any)
                : ctx.params;
            const result = methodValidators.params.validate(input);
            if (result.success) {
                (validated as any).params = result.data;
            } else {
                if (!errors) errors = {};
                errors.params = result.issues;
            }
        }

        // Query (lazy ctx.query, fast Bun-native parser)
        if (methodValidators.query) {
            const queryParams = (ctx.query ?? {}) as Record<
                string,
                string | string[]
            >;
            const input = coercion?.query
                ? applyCoercion(coercion.query, queryParams)
                : queryParams;
            const result = methodValidators.query.validate(input);
            if (result.success) {
                (validated as any).query = result.data;
            } else {
                if (!errors) errors = {};
                errors.query = result.issues;
            }
        }

        // Headers (validate header values; additive slot, phase3 §5/M5)
        if (methodValidators.headers) {
            const headerRecord: Record<string, string> = {};
            ctx.headers.forEach((value, key) => {
                headerRecord[key.toLowerCase()] = value;
            });
            const input = coercion?.headers
                ? applyCoercion(coercion.headers, headerRecord)
                : headerRecord;
            const result = methodValidators.headers.validate(input);
            if (result.success) {
                (validated as any).headers = result.data;
            } else {
                if (!errors) errors = {};
                errors.headers = result.issues;
            }
        }

        // Cookie (validate parsed cookie values; cookie *signing* is Phase 7)
        if (methodValidators.cookie) {
            const cookieHeader = ctx.headers.get('cookie') ?? '';
            const cookieRecord = parseCookies(cookieHeader);
            const input = coercion?.cookie
                ? applyCoercion(coercion.cookie, cookieRecord)
                : cookieRecord;
            const result = methodValidators.cookie.validate(input);
            if (result.success) {
                (validated as any).cookie = result.data;
            } else {
                if (!errors) errors = {};
                errors.cookie = result.issues;
            }
        }

        // Body (gated on JSON content-type)
        if (methodValidators.body) {
            const contentType =
                ctx.headers.get('content-type') ??
                ctx.headers.get('Content-Type') ??
                '';
            if (contentType.includes('application/json')) {
                try {
                    const bodyData = await ctx.json();
                    const result = methodValidators.body.validate(bodyData);
                    if (result.success) {
                        (validated as any).body = result.data;
                        // Patch json() to return validated body
                        ctx.json = async () => result.data;
                    } else {
                        if (!errors) errors = {};
                        errors.body = result.issues;
                    }
                } catch (error: unknown) {
                    const msg =
                        error instanceof Error
                            ? error.message
                            : String(error);
                    if (!errors) errors = {};
                    errors.body = [{ message: msg }];
                }
            }
        }

        if (errors) {
            // M6: render the structured error body (mode-gated, custom renderer
            // supported, problem+json shape opt-in). The body never leaks
            // stacks/source in production (phase3 §18 R7).
            const allIssues = Object.values(errors).flat() as any[];
            const result: import('./types').ValidationResult = {
                success: false,
                issues: allIssues,
            };
            return renderValidationError(result, {
                status: 400,
                isDev,
                // Preserve every failing slot as its own key so consumers can
                // read errors per slot (legacy behavior). The flat `issues`
                // array feeds the problem+json format.
                errorsBySlot: errors as Record<string, any[]>,
                config,
            });
        }

        ctx.validated = validated;
        return undefined;
    };
}
