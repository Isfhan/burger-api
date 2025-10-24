import type { Middleware, BurgerRequest, BurgerNext } from 'burger-api';

// Allowed HTTP methods for type safety
export type HttpMethod =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'DELETE'
    | 'PATCH'
    | 'OPTIONS';

export interface CorsOptions {
    /**
     * Configures the Access-Control-Allow-Origin header.
     * - string: Sets a specific origin (e.g., 'https://example.com')
     * - string[]: Sets multiple allowed origins
     * - '*': Allows all origins
     * - function: Custom logic to determine the origin
     *
     * @default '*'
     */
    origin?: '*' | string | string[] | ((origin: string) => boolean);

    /**
     * Configures the Access-Control-Allow-Methods header.
     * Specifies which HTTP methods are allowed when accessing the resource.
     *
     * @default ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
     */
    methods?: HttpMethod[];

    /**
     * Configures the Access-Control-Allow-Headers header.
     * Specifies which headers can be used during the actual request.
     *
     * @default ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-API-Key']
     */
    allowedHeaders?: string[];

    /**
     * Configures the Access-Control-Expose-Headers header.
     * Specifies which headers are safe to expose to the client.
     *
     * @default []
     */
    exposedHeaders?: string[];

    /**
     * Configures the Access-Control-Allow-Credentials header.
     * Indicates whether the response can be shared when credentials are included.
     *
     * @default false
     */
    credentials?: boolean;

    /**
     * Configures the Access-Control-Max-Age header.
     * Indicates how long the results of a preflight request can be cached (in seconds).
     *
     * @default 600 (10 minutes)
     */
    maxAge?: number;

    /**
     * Enables debug logging for CORS operations.
     * Logs rejected origins, preflight requests, and response transformations.
     *
     * @default false
     */
    debug?: boolean;

    /**
     * Enforces HTTPS origins in production environments.
     * Blocks insecure HTTP origins when enabled.
     *
     * @default false
     */
    enforceHttps?: boolean;
}

/**
 * Creates a CORS (Cross-Origin Resource Sharing) middleware for handling cross-origin requests.
 *
 * This middleware enables your API to be accessible from different origins by setting
 * appropriate CORS headers. It handles preflight OPTIONS requests automatically.
 *
 * @param options - Configuration options for CORS behavior
 * @returns A middleware function that adds CORS headers to responses
 *
 * @example
 * ```typescript
 * // Allow all origins (default)
 * const corsMiddleware = cors();
 *
 * // Allow specific origin with debugging
 * const corsMiddleware = cors({
 *   origin: 'https://example.com',
 *   credentials: true,
 *   debug: true
 * });
 *
 * // Production configuration with HTTPS enforcement
 * const corsMiddleware = cors({
 *   origin: ['https://example.com', 'https://app.example.com'],
 *   credentials: true,
 *   enforceHttps: true,
 *   debug: process.env.NODE_ENV !== 'production'
 * });
 * ```
 */
export function cors(options: CorsOptions = {}): Middleware {
    const {
        origin = '*',
        methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders = [
            'Content-Type',
            'Authorization',
            'Accept',
            'X-Requested-With',
            'X-API-Key',
        ],
        exposedHeaders = [],
        credentials = false,
        maxAge = 600,
        debug = false,
        enforceHttps = false,
    } = options;

    // 🔒 --- Configuration Validation (compile-time) ---
    if (credentials && origin === '*') {
        throw new Error(
            '[CORS] Invalid config: cannot use credentials with "*" origin.'
        );
    }

    if (maxAge <= 0) {
        throw new Error('[CORS] Invalid config: maxAge must be > 0.');
    }

    if (maxAge > 86400 && debug) {
        console.warn(
            '[CORS] Warning: maxAge exceeds 86400 seconds (24h). Consider lowering it.'
        );
    }

    // ⚡ --- Pre-compute expensive operations ---
    const isWildcard = origin === '*';
    const isStringOrigin = typeof origin === 'string';
    const isArrayOrigin = Array.isArray(origin);
    const isFunctionOrigin = typeof origin === 'function';

    // Pre-compute lowercase arrays for case-insensitive matching
    const allowedHeadersLower = allowedHeaders.map((h) => h.toLowerCase());
    const originArrayLower = isArrayOrigin
        ? origin.map((o) => o.toLowerCase())
        : null;
    const stringOriginLower = isStringOrigin ? origin.toLowerCase() : null;

    // Pre-compute joined strings to avoid repeated operations
    const methodsString = methods.join(', ');
    const allowedHeadersString = allowedHeaders.join(', ');
    const exposedHeadersString =
        exposedHeaders.length > 0 ? exposedHeaders.join(', ') : '';

    // Pre-compute maxAge string
    const maxAgeString = maxAge.toString();

    // Pre-compute common header objects
    const preflightHeadersBase = {
        'Access-Control-Allow-Methods': methodsString,
        'Access-Control-Max-Age': maxAgeString,
    };

    const credentialsHeader: Record<string, string> = credentials
        ? { 'Access-Control-Allow-Credentials': 'true' }
        : {};
    const exposedHeadersHeader: Record<string, string> = exposedHeadersString
        ? { 'Access-Control-Expose-Headers': exposedHeadersString }
        : {};

    // Pre-compute regex for HTTPS enforcement (faster than startsWith)
    const httpRegex =
        enforceHttps && process.env.NODE_ENV === 'production' ? /^http:/ : null;

    // Pre-compute error responses to avoid repeated JSON.stringify
    const originNotAllowedError = JSON.stringify({
        success: false,
        error: 'Origin not allowed by CORS policy',
    });
    const insecureOriginError = JSON.stringify({
        success: false,
        error: 'Insecure origin not allowed',
    });

    return (req: BurgerRequest): BurgerNext => {
        const requestOrigin = req.headers.get('Origin');

        // ⚡ Fast path: no origin header
        if (!requestOrigin) {
            if (isWildcard) {
                return handlePreflightOrResponse(
                    req,
                    '*',
                    preflightHeadersBase,
                    credentialsHeader,
                    exposedHeadersHeader,
                    debug
                );
            }
            // No origin but not wildcard - reject
            if (debug) console.warn('[CORS] Rejected: no origin header');
            return new Response(originNotAllowedError, {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // ⚡ Fast path: wildcard origin
        if (isWildcard) {
            return handlePreflightOrResponse(
                req,
                '*',
                preflightHeadersBase,
                credentialsHeader,
                exposedHeadersHeader,
                debug
            );
        }

        // ⚡ HTTPS enforcement check (early exit)
        if (httpRegex && httpRegex.test(requestOrigin)) {
            if (debug)
                console.warn(
                    `[CORS] Rejected insecure origin: ${requestOrigin}`
                );
            return new Response(insecureOriginError, {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // ⚡ Determine allowed origin with optimized branching
        let allowedOrigin: string | null = null;
        const requestOriginLower = requestOrigin.toLowerCase();

        if (isStringOrigin) {
            // Single string origin - direct comparison
            allowedOrigin =
                stringOriginLower === requestOriginLower ? requestOrigin : null;
        } else if (isArrayOrigin) {
            // Array origin - use pre-computed lowercase array
            allowedOrigin = originArrayLower!.includes(requestOriginLower)
                ? requestOrigin
                : null;
        } else if (isFunctionOrigin) {
            // Function origin - call once
            allowedOrigin = origin(requestOrigin) ? requestOrigin : null;
        }

        // ⚡ Reject invalid origins
        if (!allowedOrigin) {
            if (debug) console.warn(`[CORS] Rejected origin: ${requestOrigin}`);
            return new Response(originNotAllowedError, {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return handlePreflightOrResponse(
            req,
            allowedOrigin,
            preflightHeadersBase,
            credentialsHeader,
            exposedHeadersHeader,
            debug
        );
    };

    // ⚡ --- Optimized preflight and response handler ---
    function handlePreflightOrResponse(
        req: BurgerRequest,
        allowedOrigin: string,
        preflightHeadersBase: Record<string, string>,
        credentialsHeader: Record<string, string>,
        exposedHeadersHeader: Record<string, string>,
        debug: boolean
    ): BurgerNext {
        // ⚡ Preflight request optimization
        if (req.method === 'OPTIONS') {
            // Optimize header parsing - avoid unnecessary operations
            const requestedHeadersRaw = req.headers.get(
                'Access-Control-Request-Headers'
            );
            let requestedHeaders: string[];

            if (requestedHeadersRaw) {
                // Use split with limit to avoid processing too many headers
                const headers = requestedHeadersRaw.split(',', 20); // Limit to 20 headers max
                requestedHeaders = [];

                // Manual filtering loop (faster than array methods for small arrays)
                for (let i = 0; i < headers.length; i++) {
                    const header = headers[i].trim();
                    if (
                        header &&
                        allowedHeadersLower.includes(header.toLowerCase())
                    ) {
                        requestedHeaders.push(header);
                    }
                }

                // Fallback to default if no valid headers found
                if (requestedHeaders.length === 0) {
                    requestedHeaders = allowedHeaders;
                }
            } else {
                requestedHeaders = allowedHeaders;
            }

            if (debug) {
                console.log('[CORS] Preflight:', {
                    origin: req.headers.get('Origin'),
                    allowed: !!allowedOrigin,
                    requestedHeaders,
                });
            }

            // ⚡ Build response headers efficiently
            const headers = {
                'Access-Control-Allow-Origin': allowedOrigin,
                'Access-Control-Allow-Headers': requestedHeaders.join(', '),
                ...preflightHeadersBase,
                ...credentialsHeader,
                ...exposedHeadersHeader,
            };

            return new Response(null, { status: 204, headers });
        }

        // ⚡ Normal request - optimized response transformation
        return async (response: Response): Promise<Response> => {
            const headers = new Headers(response.headers);

            // ⚡ Set headers in optimal order (most common first)
            headers.set('Access-Control-Allow-Origin', allowedOrigin);
            headers.set('Access-Control-Allow-Methods', methodsString);
            headers.set('Access-Control-Allow-Headers', allowedHeadersString);

            if (credentials) {
                headers.set('Access-Control-Allow-Credentials', 'true');
            }

            if (exposedHeadersString) {
                headers.set(
                    'Access-Control-Expose-Headers',
                    exposedHeadersString
                );
            }

            if (debug) {
                console.log('[CORS] Applied to response:', {
                    origin: req.headers.get('Origin'),
                    allowedOrigin,
                    credentials,
                    exposedHeaders: exposedHeadersString,
                });
            }

            // ⚡ Reuse response body stream for better memory efficiency
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        };
    }
}

/**
 * Creates a JSON error response with the given message and status code.
 * @param message - The error message to include in the response.
 * @param status - The HTTP status code to include in the response.
 * @returns A Response object with the JSON error response.
 */
function createJsonError(message: string, status = 403): Response {
    return new Response(JSON.stringify({ success: false, error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
