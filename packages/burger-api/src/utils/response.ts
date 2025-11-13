/**
 * The method not allowed response
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
