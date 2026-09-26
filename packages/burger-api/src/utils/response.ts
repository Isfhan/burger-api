/**
 * The 404 body is a constant (RFC 9457 Problem Details), so it is serialized
 * once. A prebuilt `Response` is cloned per request — `clone()` is
 * substantially cheaper than re-running the `Response` constructor with a
 * headers init (measured; same technique as Elysia's prebuilt 404) and each
 * clone gets its own body stream.
 */
const NOT_FOUND_BODY = JSON.stringify({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'Not Found',
});

const PROBLEM_JSON_HEADERS = { 'Content-Type': 'application/problem+json' };

/**
 * Prebuilt 404 template, created on FIRST use — never at module scope
 * (Workers forbid `new Response()` during module evaluation; see
 * `test/adapter/no-global-scope-side-effects.test.ts`).
 */
let notFoundTemplate: Response | undefined;

/**
 * Builds the framework's 404 response (RFC 9457 Problem Details).
 *
 * Returns a clone of a prebuilt `Response`: a `Response` body is a single-use
 * stream, so one shared instance cannot be returned directly — but cloning it
 * is cheaper than constructing a fresh one per request.
 */
export const notFound = (): Response => {
    const template =
        notFoundTemplate ??
        (notFoundTemplate = new Response(NOT_FOUND_BODY, {
            status: 404,
            headers: PROBLEM_JSON_HEADERS,
        }));
    return template.clone();
};

/**
 * The OpenAPI error response.
 *
 * A factory — see {@link notFound}: never share a `Response` instance
 * with a body across requests.
 */
export const openApiError = (): Response =>
    Response.json({
        error: 'API Router not configured',
        message:
            'Please provide an apiDir option when initializing the Burger instance to enable OpenAPI documentation.',
    });

interface MethodNotAllowedTemplate {
    body: string;
    headers: Headers;
}

/**
 * Per-`Allow` templates: the body string and headers are built once, then each
 * request gets a fresh `Response` over the same immutable init (bodies are
 * single-use; a `Headers` instance is copied by the constructor).
 * Keyed by the precomputed `Allow` value, so the map size is bounded by the
 * route table.
 */
const methodNotAllowedTemplates = new Map<string, MethodNotAllowedTemplate>();

/**
 * Builds a 405 response that includes the `Allow` header listing the methods
 * supported by the matched route. Returns RFC 9457 Problem Details format.
 * @param allow - comma-separated allowed methods, e.g. "GET, POST"
 */
export function methodNotAllowed(allow: string): Response {
    let template = methodNotAllowedTemplates.get(allow);
    if (template === undefined) {
        template = {
            body: JSON.stringify({
                type: 'about:blank',
                title: 'Method Not Allowed',
                status: 405,
                detail: `Supported methods: ${allow}`,
            }),
            headers: new Headers({
                Allow: allow,
                'Content-Type': 'application/problem+json',
            }),
        };
        methodNotAllowedTemplates.set(allow, template);
    }
    return new Response(template.body, {
        status: 405,
        headers: template.headers,
    });
}

/**
 * The framework's auto-generated OPTIONS handler (CORS preflight, 204 No
 * Content). Built per route so the response can advertise the route's
 * supported methods via `Allow` (RFC 9110).
 *
 * The returned handler is tagged with `isAutoOptions` so the router compiler
 * can recognize it (e.g. for Bun native static responses) without relying on
 * function identity.
 */
export interface AutoOptionsHandler {
    (): Response;
    isAutoOptions: true;
    allowHeader: string;
}

export const createAutoOptionsHandler = (
    allowMethods: string[]
): AutoOptionsHandler => {
    const allowHeader = allowMethods.join(', ');
    const handler = (() =>
        new Response(null, {
            status: 204,
            headers: { Allow: allowHeader },
        })) as AutoOptionsHandler;
    handler.isAutoOptions = true;
    handler.allowHeader = allowHeader;
    return handler;
};

import type { ContextSet } from '../context/types.js';
import {
    SET_HEADERS,
    TrackedContextSet,
} from '../context/context-set.js';

/**
 * Reports whether a `ContextSet` carries any response mutation.
 *
 * For the framework's own `ctx.set` (a `TrackedContextSet`) this is one flag
 * read; plain objects (callers passing a literal) fall back to a scan.
 * `applySet` uses this to skip rebuilding the `Response` when nothing changed.
 */
export function hasSetMutations(set?: ContextSet): boolean {
    if (!set) return false;
    if (set instanceof TrackedContextSet) return set.flags !== 0;
    if (set.status !== undefined) return true;
    const headers = set.headers;
    if (headers) {
        if (headers instanceof Headers) {
            // Bun's `Headers.size` typing is unreliable; iterate to detect content.
            for (const _ of headers as unknown as Iterable<[string, string]>) {
                return true;
            }
        } else if (Object.keys(headers).length > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Merges a `ContextSet` (`req.set`) into the outgoing `Response`.
 *
 * Rules (see ):
 * - `set.headers` is merged *over* the response's existing headers; explicitly
 * set values win. Headers the handler already set are kept unless overridden
 * by name.
 * - `set.status` overrides the response status **only when defined**; otherwise
 * the handler's status is preserved.
 * - Runs exactly once, at the single pipeline exit, for every response path.
 *
 * The `set` object is optional and, when it carries no mutation, the original
 * `Response` is returned unchanged (no `Response` rebuild, no extra headers
 * allocation).
 */
export function applySet(response: Response, set?: ContextSet): Response {
    if (!set) return response;

    if (set instanceof TrackedContextSet) {
        const flags = set.flags;
        if (flags === 0) return response;
        if ((flags & SET_HEADERS) === 0) {
            // Status-only mutation: the `Response` constructor copies the
            // header list itself, so no explicit `new Headers(...)` copy is
            // needed (Elysia 1's three-property `mapResponse` check).
            return new Response(response.body, {
                status: set.status ?? response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        }
    } else if (!hasSetMutations(set)) {
        return response;
    }

    const headers = new Headers(response.headers);
    const setHeaders = set.headers;
    if (setHeaders) {
        if (setHeaders instanceof Headers) {
            for (const entry of setHeaders as unknown as Iterable<
                [string, string]
            >) {
                headers.set(entry[0], entry[1]);
            }
        } else {
            for (const key in setHeaders) {
                const value = setHeaders[key];
                if (value !== undefined) headers.set(key, value);
            }
        }
    }

    const status = set.status ?? response.status;

    return new Response(response.body, {
        status,
        statusText: response.statusText,
        headers,
    });
}
