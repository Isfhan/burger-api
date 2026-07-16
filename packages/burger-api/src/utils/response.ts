/**
 * The method not allowed response (legacy constant, kept for backward compat).
 */
export const METHOD_NOT_ALLOWED = new Response('Method Not Allowed', {
    status: 405,
});

/**
 * The not found response
 */
export const NOT_FOUND = new Response('Not Found', { status: 404 });

/**
 * The OpenAPI error response
 */
export const OPENAPI_ERROR = Response.json({
    error: 'API Router not configured',
    message:
        'Please provide an apiDir option when initializing the Burger instance to enable OpenAPI documentation.',
});

/**
 * Builds a 405 response that includes the `Allow` header listing the methods
 * supported by the matched route.
 * @param allow - comma-separated allowed methods, e.g. "GET, POST"
 */
export function methodNotAllowed(allow: string): Response {
    return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: allow },
    });
}

/**
 * The framework's auto-generated OPTIONS handler (CORS preflight, 204 No Content).
 * Exported so the router compiler can recognize it and, when safe, serve it via
 * `Bun.nativeStaticResponse`.
 */
export const autoOptionsHandler = (): Response =>
    new Response(null, { status: 204 });

import type { ContextSet } from '../context/types';

/**
 * Reports whether a `ContextSet` carries any response mutation.
 *
 * `applySet` uses this to skip rebuilding the `Response` when nothing changed
 * (ROADMAP-phase2 §8.7 — zero work when no mutations exist).
 */
export function hasSetMutations(set?: ContextSet): boolean {
    if (!set) return false;
    if (set.status !== undefined) return true;
    const headers = set.headers;
    if (headers) {
        if (headers instanceof Headers) {
            // Bun's `Headers.size` typing is unreliable; iterate to detect content.
            let nonEmpty = false;
            headers.forEach(() => {
                nonEmpty = true;
            });
            if (nonEmpty) return true;
        } else if (Object.keys(headers).length > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Merges a `ContextSet` (`req.set`) into the outgoing `Response`.
 *
 * Rules (see ROADMAP-phase2.md §8.7):
 * - `set.headers` is merged *over* the response's existing headers; explicitly
 *   set values win. Headers the handler already set are kept unless overridden
 *   by name.
 * - `set.status` overrides the response status **only when defined**; otherwise
 *   the handler's status is preserved.
 * - Runs exactly once, at the single pipeline exit, for every response path.
 *
 * The `set` object is optional and, when it carries no mutation, the original
 * `Response` is returned unchanged (no `Response` rebuild, no extra headers
 * allocation).
 */
export function applySet(response: Response, set?: ContextSet): Response {
    if (!set || !hasSetMutations(set)) return response;

    const headers = new Headers(response.headers);
    const setHeaders = set.headers;
    if (setHeaders) {
        if (setHeaders instanceof Headers) {
            setHeaders.forEach((value, key) => headers.set(key, value));
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
