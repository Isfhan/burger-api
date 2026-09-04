/**
 * The validation coordinator — builds the framework's validation hook from
 * precompiled route validators.
 *
 * It consumes the prepared `CompiledRouteValidators` produced by the schema
 * preparation component. When a request comes in it runs `cv.validate(value)`
 * once per slot — no walk over the raw schema, no adapter (connector)
 * selection, no preparing at request time. It does NOT redesign
 * the hook pipeline.
 *
 * Behavior:
 * - skips work when `ctx.validated` is already set,
 * - validates params/query/headers/cookies/body with the same checks,
 * - throws a `ValidationError` (422, RFC 9457 problem details) on failure.
 */

import type { BurgerContext } from '../context/context.js';
import type { LowercaseHTTPMethod } from '../utils/routing.js';
import type { ForwardHook } from '../lifecycle/types.js';
import type {
    CompiledRouteValidators,
    ValidatorConfig,
    ValidationIssue,
    ValidationSlot,
} from './types.js';
import { apply as applyCoercion } from './coerce.js';
import { ValidationError } from './error.js';

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
    // Null prototype: cookie names are attacker-controlled and must never
    // touch the object prototype (`__proto__` / `constructor`).
    const out: Record<string, string> = Object.create(null);
    if (!header) return out;
    for (const [key, rawValue] of splitCookiePairs(header)) {
        try {
            out[key] = decodeURIComponent(rawValue);
        } catch {
            // Malformed percent-encoding (e.g. "%ZZ") — keep the raw value
            // rather than throwing inside the validator.
            out[key] = rawValue;
        }
    }
    return out;
}

/**
 * Builds the validation hook from precompiled route validators.
 *
 * On failure, throws a `ValidationError` (status 422, or
 * `ValidatorConfig.status` when set) into the `onError` pipeline. The
 * framework's default onError handler renders the RFC 9457 response.
 *
 * @param validators - the compiled validators for this route (may be empty).
 * @param config - validation configuration (custom status, error format).
 * @param isDev - reserved for future use (dev diagnostics).
 */
export function createValidationHook(
    validators: CompiledRouteValidators,
    config: ValidatorConfig = {},
    isDev = false
): ForwardHook {
    return async (ctx: BurgerContext): Promise<Response | void | undefined> => {
        // If the request has already been validated, continue.
        if (ctx.validated) {
            return undefined;
        }

        const method = (ctx.method || 'get').toLowerCase();
        // Runtime method strings are lowercased before lookup; only methods in
        // the union can be keys of the compiled map, so widening is safe.
        let methodValidators = (
            validators.methods as Record<string, (typeof validators.methods)[LowercaseHTTPMethod] | undefined>
        )[method];
        // Auto-HEAD: a GET route implies HEAD is allowed, so HEAD reuses GET's
        // validators (the body slot is skipped below — HEAD carries no body).
        if (!methodValidators && method === 'head') {
            methodValidators = validators.methods['get'];
        }
        if (!methodValidators) {
            return undefined;
        }

        // The validated bag mirrors the `BurgerValidated` slots exactly, so it
        // is assignable to `ctx.validated` without an assertion.
        const validated: Partial<Record<ValidationSlot, unknown>> = {};

        // Track errors per slot — only populated on failure.
        let errorsBySlot: Record<string, ValidationIssue[]> | null = null;

        const coercion = methodValidators.coercion;

        // Params
        if (methodValidators.params && ctx.params) {
            const input = coercion?.params
                ? applyCoercion(coercion.params, ctx.params)
                : ctx.params;
            const result = methodValidators.params.validate(input);
            if (result.success) {
                validated.params = result.data;
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
                validated.query = result.data;
            } else {
                if (!errorsBySlot) errorsBySlot = {};
                errorsBySlot.query = result.issues;
            }
        }

        // Headers
        if (methodValidators.headers) {
            // Null prototype: header names are attacker-controlled.
            const headerRecord: Record<string, string> = Object.create(null);
            ctx.headers.forEach((value, key) => {
                headerRecord[key.toLowerCase()] = value;
            });
            const input = coercion?.headers
                ? applyCoercion(coercion.headers, headerRecord)
                : headerRecord;
            const result = methodValidators.headers.validate(input);
            if (result.success) {
                validated.headers = result.data;
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
                validated.cookies = result.data;
            } else {
                if (!errorsBySlot) errorsBySlot = {};
                errorsBySlot.cookies = result.issues;
            }
        }

        // Body (gated on the JSON media type — parsed from the raw header so
        // casing (`Application/JSON`) and parameters (`; charset=utf-8`)
        // can't bypass or confuse the gate). Skipped for HEAD: a HEAD request
        // carries no body, so the GET body schema cannot apply.
        if (methodValidators.body && method !== 'head') {
            const rawContentType = ctx.headers.get('content-type') ?? '';
            const mediaType = rawContentType.split(';')[0]!.trim().toLowerCase();
            if (mediaType === 'application/json') {
                try {
                    const bodyData = await ctx.json();
                    const result = methodValidators.body.validate(bodyData);
                    if (result.success) {
                        validated.body = result.data;
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
            } else if (rawContentType.trim() === '') {
                // A body schema is declared but the client sent no
                // Content-Type — reject rather than silently skipping
                // validation.
                if (!errorsBySlot) errorsBySlot = {};
                errorsBySlot.body = [
                    {
                        path: [],
                        message:
                            'Content-Type header required for body validation',
                    },
                ];
            }
            // Any other (non-JSON) media type skips body validation as
            // before — the body is not JSON.
        }

        if (errorsBySlot) {
            // Throw into the onError pipeline — the framework renders the
            // RFC 9457 response via the default onError fallback.
            const allIssues = Object.values(errorsBySlot).flat();
            const firstSlot = Object.keys(errorsBySlot)[0] as ValidationSlot;
            throw new ValidationError(firstSlot, allIssues, {
                errorsBySlot,
                status: config.status,
            });
        }

        ctx.validated = validated;
        return undefined;
    };
}
