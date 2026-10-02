/**
 * The 404 body is a constant (RFC 9457 Problem Details), so it is serialized
 * once; every call builds a fresh `Response` over it.
 */
const NOT_FOUND_BODY = JSON.stringify({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'Not Found',
});

/**
 * 404 init with a prebuilt `Headers`: the constructor copies it, which is
 * much cheaper than parsing a plain headers object per call. Built on first
 * use, never at module scope (Workers restrict work during module load).
 */
let notFoundInit: ResponseInit | undefined;

/**
 * Builds the framework's 404 response (RFC 9457 Problem Details). A fresh
 * `Response` per call: a cached template cannot be cloned reliably — runtimes
 * (workerd) lock a shared template's body stream once it has been served, so
 * the next `clone()` throws and the request 500s.
 */
export const notFound = (): Response =>
    new Response(
        NOT_FOUND_BODY,
        (notFoundInit ??= {
            status: 404,
            headers: new Headers({
                'Content-Type': 'application/problem+json',
            }),
        })
    );

/**
 * The OpenAPI error response. A factory — see {@link notFound}: never share a
 * `Response` instance with a body across requests.
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
 * Per-`Allow` 405 templates, built once and reused. Bodies are single-use, so
 * each request gets a fresh `Response` over the same immutable init; the map
 * is bounded by the route table's `Allow` values.
 */
const methodNotAllowedTemplates = new Map<string, MethodNotAllowedTemplate>();

/**
 * Builds a 405 (RFC 9457) with the `Allow` header listing the methods the
 * matched route supports.
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
 * The auto-generated OPTIONS handler (CORS preflight, 204), built per route so
 * it can advertise the route's methods via `Allow` (RFC 9110).
 *
 * Tagged with `isAutoOptions` so the router compiler can recognize it (e.g.
 * for Bun native static responses) without relying on function identity.
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
 * Whether a `ContextSet` carries any response mutation. For the framework's
 * `TrackedContextSet` it is one flag read; plain objects fall back to a scan.
 * `applySet` uses this to skip rebuilding the `Response`.
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
 * Merges a `ContextSet` (`ctx.set`) into the outgoing `Response`:
 * - `set.headers` is merged over the response's headers; explicitly set values
 *   win and other handler headers are kept.
 * - `set.status` overrides the response status only when defined, and NEVER
 *   overrides an error status (>= 400) — errors stay errors.
 * - Runs once at the pipeline exit, for every response path; returns the
 *   original `Response` unchanged when there is nothing to apply.
 */
export function applySet(response: Response, set?: ContextSet): Response {
    if (!set) return response;
    // Errors are authoritative: `ctx.set.status` may only restyle successes.
    const setStatus = response.status >= 400 ? undefined : set.status;

    if (set instanceof TrackedContextSet) {
        const flags = set.flags;
        if (flags === 0) return response;
        if ((flags & SET_HEADERS) === 0) {
            // Status-only mutation: the `Response` constructor copies the
            // header list itself, so no explicit `new Headers(...)` copy is
            // needed.
            return new Response(response.body, {
                status: setStatus ?? response.status,
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

    return new Response(response.body, {
        status: setStatus ?? response.status,
        statusText: response.statusText,
        headers,
    });
}
