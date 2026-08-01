/**
 * The validator coordinator — the evolution of
 * `createValidationMiddleware` (§13.6).
 *
 * It consumes the prepared `CompiledRouteValidators` produced by the schema
 * preparation component. When a request comes in it runs `cv.validate(value)`
 * once per slot — no walk over the raw schema, no adapter (connector)
 * selection, no preparing at request time (). It does NOT redesign
 * the hook pipeline.
 *
 * Behavior mirrors the legacy lifecycle so existing applications behave
 * identically:
 * - skips work when `req.validated` is already set,
 * - validates params/query/body with the same checks,
 * - returns 422 with RFC 9457 problem details on failure.
 */

import type { BurgerContext, BurgerValidated } from '../context/context';
import type { BurgerNext } from '../types/index';
import type { Hook } from '../lifecycle/types';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
    ValidationIssue,
    ValidationSlot,
} from './types';
import { apply as applyCoercion } from './coerce';
import { ValidationError } from './error';

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
        while (i < header.length && (header[i] === ' ' || header[i] === ';'))
            i++;
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

/** Parses a `Cookie` header value into a flat record (cookie slot). */
export function parseCookies(
    header: string | null | undefined
): Record<string, string> {
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
 * Builds the validation hook from precompiled route validators.
 *
 * On failure, throws a `ValidationError` (status 422) into the `onError`
 * pipeline. The framework's default onError handler renders the RFC 9457
 * response.
 *
 * @param validators - the compiled validators for this route (may be empty).
 * @param _config - reserved for future use (error format / renderer).
 * @param _isDev - reserved for future use (dev diagnostics).
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

        // Track errors per slot — only populated on failure.
        let errorsBySlot: Record<string, ValidationIssue[]> | null = null;

        const coercion = methodValidators.coercion;

        // Params
        if (methodValidators.params && ctx.params) {
            const input = coercion?.params
                ? applyCoercion(coercion.params, ctx.params as any)
                : ctx.params;
            const result = methodValidators.params.validate(input);
            if (result.success) {
                (validated as any).params = result.data;
            } else {
                if (!errorsBySlot) errorsBySlot = {};
                errorsBySlot.params = result.issues;
            }
        }

        // Query
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
                if (!errorsBySlot) errorsBySlot = {};
                errorsBySlot.query = result.issues;
            }
        }

        // Headers
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
                if (!errorsBySlot) errorsBySlot = {};
                errorsBySlot.headers = result.issues;
            }
        }

        // Cookies
        if (methodValidators.cookies) {
            const cookieHeader = ctx.headers.get('cookie') ?? '';
            const cookieRecord = parseCookies(cookieHeader);
            const input = coercion?.cookies
                ? applyCoercion(coercion.cookies, cookieRecord)
                : cookieRecord;
            const result = methodValidators.cookies.validate(input);
            if (result.success) {
                (validated as any).cookies = result.data;
            } else {
                if (!errorsBySlot) errorsBySlot = {};
                errorsBySlot.cookies = result.issues;
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
                    } else {
                        if (!errorsBySlot) errorsBySlot = {};
                        errorsBySlot.body = result.issues;
                    }
                } catch (error: unknown) {
                    const msg =
                        error instanceof Error ? error.message : String(error);
                    if (!errorsBySlot) errorsBySlot = {};
                    errorsBySlot.body = [{ path: [], message: msg }];
                }
            }
        }

        if (errorsBySlot) {
            // Throw into the onError pipeline — the framework renders the
            // RFC 9457 response via the default onError fallback.
            const allIssues = Object.values(errorsBySlot).flat();
            const firstSlot = Object.keys(errorsBySlot)[0] as ValidationSlot;
            throw new ValidationError(firstSlot, allIssues, {
                errorsBySlot,
            });
        }

        ctx.validated = validated as BurgerValidated;
        return undefined;
    };
}
