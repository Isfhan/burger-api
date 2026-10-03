/**
 * The validation coordinator — builds the framework's validation hook from
 * precompiled route validators.
 *
 * Runs `cv.validate(value)` once per slot — no walk over the raw schema, no
 * adapter selection, no preparing at request time. Skips work when
 * `ctx.validated` is already set and validates
 * params/query/headers/cookies/body with the same checks.
 *
 * Throws `ValidationError` (422, RFC 9457 problem details) on failure, or
 * `HTTPError(415)` when a body schema is declared but the request body is not
 * JSON (never skips validation).
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
import { HTTPError } from '../errors/http-error.js';

/** The per-method compiled validators (the resolved lookup target). */
type MethodValidators = NonNullable<
    CompiledRouteValidators['methods'][LowercaseHTTPMethod]
>;

/**
 * Splits a `Cookie` header into `name=value` pairs, following RFC 6265 quoted
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
 * Resolves the validators for a lowercase method, reusing GET's validators
 * for HEAD (auto-HEAD: a GET route implies HEAD is allowed; the body slot is
 * skipped by the caller).
 */
function resolveMethodValidators(
    validators: CompiledRouteValidators,
    method: string
): MethodValidators | undefined {
    // Runtime method strings are lowercased before lookup; only methods in
    // the union can be keys of the compiled map, so widening is safe.
    let methodValidators = (
        validators.methods as Record<string, MethodValidators | undefined>
    )[method];
    if (!methodValidators && method === 'head') {
        methodValidators = validators.methods['get'];
    }
    return methodValidators;
}

/**
 * Lowercases an HTTP method without allocating when it is already lowercase
 * (Bun hands the uppercase form in). Returns an empty string for anything
 * that cannot be a compiled method key, so the caller takes the "no
 * validators" path.
 */
function toLowerMethod(method: string): string {
    const len = method.length;
    if (len < 3 || len > 7) return '';
    for (let i = 0; i < len; i++) {
        const code = method.charCodeAt(i);
        if (code >= 65 && code <= 90) return method.toLowerCase();
    }
    return method;
}

/**
 * Extracts the media type from a raw `Content-Type` header value without
 * `split`/`trim`/`toLowerCase` when the value is already a plain lowercase
 * token (the common case).
 */
function mediaTypeOf(raw: string): string {
    const semi = raw.indexOf(';');
    let start = 0;
    let end = semi === -1 ? raw.length : semi;
    while (start < end) {
        const c = raw.charCodeAt(start);
        if (c !== 32 && c !== 9) break;
        start++;
    }
    while (end > start) {
        const c = raw.charCodeAt(end - 1);
        if (c !== 32 && c !== 9) break;
        end--;
    }
    const slice = start === 0 && end === raw.length ? raw : raw.slice(start, end);
    // Lowercase only when the value actually carries uppercase characters
    // (the already-lowercase common case allocates nothing).
    for (let i = 0; i < slice.length; i++) {
        const c = slice.charCodeAt(i);
        if (c >= 65 && c <= 90) return slice.toLowerCase();
    }
    return slice;
}

/** True when the media type (lowercased) is JSON (`application/json`/`+json`). */
function isJsonMediaType(mediaType: string): boolean {
    if (mediaType === 'application/json') return true;
    // `application/…+json` (e.g. `application/vnd.api+json`). Shortest form
    // `application/+json` is 17 chars.
    const len = mediaType.length;
    if (len < 17) return false;
    if (mediaType.charCodeAt(0) !== 97 /* a */) return false;
    return mediaType.startsWith('application/') && mediaType.endsWith('+json');
}

/**
 * True when a raw `Content-Type` header value is JSON (`application/json` or
 * `application/…+json`). Shared by request-body and response validation.
 */
export function isJsonContentType(raw: string): boolean {
    return isJsonMediaType(mediaTypeOf(raw));
}

/** True when the value is empty or whitespace only (no `trim()` allocation). */
function isBlank(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c !== 32 && c !== 9 && c !== 10 && c !== 13) return false;
    }
    return true;
}

/**
 * Runs every declared slot for one method. Params/query/headers/cookies are
 * synchronous; only a declared body slot returns a promise.
 */
function validateMethodSlots(
    ctx: BurgerContext,
    methodValidators: MethodValidators,
    isHead: boolean,
    config: ValidatorConfig
): void | Promise<void> {
    // The validated bag matches the `BurgerValidated` slots, so it is
    // assignable to `ctx.validated` without an assertion.
    const validated: Partial<Record<ValidationSlot, unknown>> = {};

    // Track errors per slot — only populated on failure.
    let errorsBySlot: Record<string, ValidationIssue[]> | null = null;

    const coercion = methodValidators.coercion;

    // Params
    const paramsValidator = methodValidators.params;
    if (paramsValidator) {
        const input = coercion?.params
            ? applyCoercion(coercion.params, ctx.params)
            : ctx.params;
        const result = paramsValidator.validate(input);
        if (result.success) {
            validated.params = result.data;
        } else {
            if (!errorsBySlot) errorsBySlot = {};
            errorsBySlot.params = result.issues;
        }
    }

    // Query
    const queryValidator = methodValidators.query;
    if (queryValidator) {
        const queryParams = (ctx.query ?? {}) as Record<
            string,
            string | string[]
        >;
        const input = coercion?.query
            ? applyCoercion(coercion.query, queryParams)
            : queryParams;
        const result = queryValidator.validate(input);
        if (result.success) {
            validated.query = result.data;
        } else {
            if (!errorsBySlot) errorsBySlot = {};
            errorsBySlot.query = result.issues;
        }
    }

    // Headers
    const headersValidator = methodValidators.headers;
    if (headersValidator) {
        // Null prototype: header names are attacker-controlled.
        const headerRecord: Record<string, string> = Object.create(null);
        const headers = ctx.headers;
        // Bun exposes `Headers.toJSON()` (a plain record) — much cheaper than
        // iterating the Headers object. WinterCG runtimes fall back to a
        // manual key/value walk.
        const toJSON = (
            headers as unknown as { toJSON?: () => Record<string, string> }
        ).toJSON;
        if (typeof toJSON === 'function') {
            const flat = toJSON.call(headers);
            for (const key in flat) {
                headerRecord[key.toLowerCase()] = flat[key]!;
            }
        } else {
            for (const entry of headers as unknown as Iterable<
                [string, string]
            >) {
                headerRecord[entry[0].toLowerCase()] = entry[1];
            }
        }
        const input = coercion?.headers
            ? applyCoercion(coercion.headers, headerRecord)
            : headerRecord;
        const result = headersValidator.validate(input);
        if (result.success) {
            validated.headers = result.data;
        } else {
            if (!errorsBySlot) errorsBySlot = {};
            errorsBySlot.headers = result.issues;
        }
    }

    // Cookies — reuse the context's cached parse (`ctx.cookies`) when the
    // caller passed a real BurgerContext; duck-typed contexts (tests, embedded
    // callers) fall back to parsing the header directly.
    const cookiesValidator = methodValidators.cookies;
    if (cookiesValidator) {
        const cached = (ctx as { cookies?: unknown }).cookies;
        const cookieRecord =
            cached !== undefined && cached !== null
                ? (cached as Record<string, string>)
                : parseCookies(ctx.headers.get('cookie'));
        const input = coercion?.cookies
            ? applyCoercion(coercion.cookies, cookieRecord)
            : cookieRecord;
        const result = cookiesValidator.validate(input);
        if (result.success) {
            validated.cookies = result.data;
        } else {
            if (!errorsBySlot) errorsBySlot = {};
            errorsBySlot.cookies = result.issues;
        }
    }

    /** Throws a `ValidationError` on failure, else stores `validated`. */
    const finish = (): void => {
        if (errorsBySlot) {
            // Throw into the onError pipeline — the framework renders the
            // RFC 9457 response via the default onError fallback.
            const allIssues: ValidationIssue[] = [];
            let firstSlot: ValidationSlot | undefined;
            for (const slot in errorsBySlot) {
                if (firstSlot === undefined) {
                    firstSlot = slot as ValidationSlot;
                }
                const issues = errorsBySlot[slot]!;
                for (let i = 0; i < issues.length; i++) {
                    allIssues.push(issues[i]!);
                }
            }
            throw new ValidationError(firstSlot!, allIssues, {
                errorsBySlot,
                status: config.status,
            });
        }
        ctx.validated = validated;
    };

    // Body (gated on the JSON media type; skipped for HEAD, which carries
    // no body). The gate reads the raw header, so casing
    // (`Application/JSON`) and parameters (`; charset=utf-8`) cannot bypass
    // it.
    const bodyValidator = methodValidators.body;
    if (bodyValidator && !isHead) {
        const rawContentType = ctx.headers.get('content-type') ?? '';
        const mediaType = mediaTypeOf(rawContentType);

        /** Validates one body value; failures land in `errorsBySlot.body`. */
        const validateBodyValue = (bodyData: unknown): void => {
            try {
                const result = bodyValidator.validate(bodyData);
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
        };

        if (isJsonMediaType(mediaType)) {
            // Read once through `ctx.text()` (bytes are cached), so
            // `ctx.text()` / `ctx.arrayBuffer()` still work in the handler.
            // An empty body validates as `undefined`; malformed JSON is a
            // client error (400) and passes through onError, never 422.
            return ctx.text().then(
                (raw) => {
                    if (isBlank(raw)) {
                        validateBodyValue(undefined);
                    } else {
                        let bodyData: unknown;
                        try {
                            bodyData = JSON.parse(raw);
                        } catch (error) {
                            throw new HTTPError(
                                400,
                                `Malformed JSON body: ${
                                    (error as Error).message
                                }`,
                                { cause: error }
                            );
                        }
                        validateBodyValue(bodyData);
                    }
                    finish();
                },
                (error: unknown) => {
                    // Body read failure — surface as a body validation issue.
                    const msg =
                        error instanceof Error ? error.message : String(error);
                    if (!errorsBySlot) errorsBySlot = {};
                    errorsBySlot.body = [{ path: [], message: msg }];
                    finish();
                }
            );
        } else if (isBlank(rawContentType)) {
            // No media type: an empty body validates as `undefined` (optional
            // schemas work); a non-empty body is rejected rather than
            // silently skipping validation.
            return ctx.text().then((raw) => {
                if (isBlank(raw)) {
                    validateBodyValue(undefined);
                } else {
                    if (!errorsBySlot) errorsBySlot = {};
                    errorsBySlot.body = [
                        {
                            path: [],
                            message:
                                'Content-Type header required for body validation',
                        },
                    ];
                }
                finish();
            });
        } else {
            // A body schema is declared but the body is not JSON (form,
            // text, …). Never let unvalidated data reach the handler:
            // 415 Unsupported Media Type (RFC 9457 via onError).
            throw new HTTPError(
                415,
                `Unsupported Media Type "${mediaType}" — this endpoint expects application/json`
            );
        }
    }

    finish();
    return undefined;
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
 * @param method - when given, the hook is specialized for that lowercase
 *   method at compile time (no per-request method lookup).
 * @param skipValidatedBag - when true, a method without validators does not
 *   allocate the empty `{}` bag (only legal with `method` given).
 */
export function createValidationHook(
    validators: CompiledRouteValidators,
    config: ValidatorConfig = {},
    isDev = false,
    method?: LowercaseHTTPMethod,
    skipValidatedBag = false
): ForwardHook {
    void isDev;
    if (method !== undefined) {
        const methodValidators = resolveMethodValidators(validators, method);
        const isHead = method === 'head';
        if (!methodValidators) {
            if (skipValidatedBag) return () => undefined;
            // Methods without a schema still get an (empty) validated bag, so
            // route hooks typed via `defineHooks` can read slots safely.
            return (ctx: BurgerContext) => {
                if (!ctx.validated) ctx.validated = {};
                return undefined;
            };
        }
        // NOT an `async` function: body-less schemas validate synchronously,
        // and the pipeline awaits the result only when a Promise is returned.
        return (ctx: BurgerContext): void | Promise<void> => {
            if (ctx.validated) return undefined;
            return validateMethodSlots(ctx, methodValidators, isHead, config);
        };
    }

    // General path: resolve the method at request time (kept for callers
    // that build a route-agnostic hook).
    return (ctx: BurgerContext): void | Promise<void> => {
        // If the request has already been validated, continue.
        if (ctx.validated) {
            return undefined;
        }
        const methodLower = toLowerMethod(ctx.method || 'get');
        const methodValidators = resolveMethodValidators(
            validators,
            methodLower
        );
        if (!methodValidators) {
            ctx.validated = {};
            return undefined;
        }
        return validateMethodSlots(
            ctx,
            methodValidators,
            methodLower === 'head',
            config
        );
    };
}
