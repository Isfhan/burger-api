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
