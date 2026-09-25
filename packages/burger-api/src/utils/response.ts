/**
 * Builds the framework's 404 response (RFC 9457 Problem Details).
 *
 * A factory (not a shared constant): a `Response` body is a single-use
 * stream — reusing one instance across requests would consume it on the
 * first hit and return an empty body for every later request.
 */
export const notFound = (): Response =>
    new Response(
        JSON.stringify({
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            detail: 'Not Found',
        }),
        {
            status: 404,
            headers: { 'Content-Type': 'application/problem+json' },
        }
    );

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

/**
 * Builds a 405 response that includes the `Allow` header listing the methods
 * supported by the matched route. Returns RFC 9457 Problem Details format.
 * @param allow - comma-separated allowed methods, e.g. "GET, POST"
 */
export function methodNotAllowed(allow: string): Response {
    return new Response(
        JSON.stringify({
            type: 'about:blank',
            title: 'Method Not Allowed',
            status: 405,
            detail: `Supported methods: ${allow}`,
        }),
        {
            status: 405,
            headers: {
                Allow: allow,
                'Content-Type': 'application/problem+json',
            },
        }
    );
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

/**
 * Reports whether a `ContextSet` carries any response mutation.
 *
 * `applySet` uses this to skip rebuilding the `Response` when nothing changed
 * (no work when no mutations exist).
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
