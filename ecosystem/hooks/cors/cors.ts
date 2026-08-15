import type { BurgerContext, BurgerNext } from 'burger-api';

// Allowed HTTP methods for type safety
export type HttpMethod =
    | 'GET'
    | 'HEAD'
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
     * @default ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
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
 * Creates a CORS (Cross-Origin Resource Sharing) hook for handling cross-origin requests.
 *
 * This hook enables your API to be accessible from different origins by setting
 * appropriate CORS headers. It handles preflight OPTIONS requests automatically.
 *
 * @param options - Configuration options for CORS behavior
 * @returns A hook function that adds CORS headers to responses
 *
 * @example
 * ```typescript
 * // Allow all origins (default)
 * const corsHook = cors();
 *
 * // Allow specific origin with debugging
 * const corsHook = cors({
 *   origin: 'https://example.com',
 *   credentials: true,
 *   debug: true
 * });
 *
 * // Production configuration with HTTPS enforcement
 * const corsHook = cors({
 *   origin: ['https://example.com', 'https://app.example.com'],
 *   credentials: true,
 *   enforceHttps: true,
 *   debug: process.env.NODE_ENV !== 'production'
 * });
 * ```
 */
export function cors(options: CorsOptions = {}): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    const {
        origin = '*',
        methods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
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

    // --- Configuration Validation (compile-time) ---
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

    // --- Pre-compute expensive operations ---
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

    // Pre-compute Vary header for non-wildcard origins
    const varyHeader: Record<string, string> = !isWildcard
        ? { Vary: 'Origin' }
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

    return (ctx: BurgerContext): BurgerNext => {
        const requestOrigin = ctx.headers.get('Origin');

        /**
         * Fast path: no origin header (same-origin request)
         * Same-origin requests don't need CORS headers - let them pass through
         */
        if (!requestOrigin) {
            // Return undefined to pass through without CORS headers
            return undefined;
        }

        // Fast path: wildcard origin
        if (isWildcard) {
            return handlePreflightOrResponse(
                ctx,
                '*',
                preflightHeadersBase,
                credentialsHeader,
                exposedHeadersHeader,
                varyHeader,
                debug
            );
        }

        // HTTPS enforcement check (early exit)
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

        // Validate origin is not empty (after trimming)
        const trimmedOrigin = requestOrigin.trim();
        if (!trimmedOrigin) {
            if (debug) console.warn('[CORS] Rejected: empty origin header');
            return new Response(originNotAllowedError, {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Determine allowed origin with optimized branching
        let allowedOrigin: string | null = null;
        const requestTrimmedOriginLower = trimmedOrigin.toLowerCase();

        if (isStringOrigin) {
            // Single string origin - direct comparison
            allowedOrigin =
                stringOriginLower === requestTrimmedOriginLower
                    ? trimmedOrigin
                    : null;
        } else if (isArrayOrigin) {
            // Array origin - use pre-computed lowercase array
            // Safe assertion: isArrayOrigin guarantees originArrayLower is non-null
            allowedOrigin = originArrayLower!.includes(
                requestTrimmedOriginLower
            )
                ? trimmedOrigin
                : null;
        } else if (isFunctionOrigin) {
            // Function origin - call once with error handling
            try {
                allowedOrigin = origin(trimmedOrigin) ? trimmedOrigin : null;
            } catch (error) {
                if (debug) {
                    console.warn(
                        `[CORS] Origin validation function threw error: ${error}`
                    );
                }
                allowedOrigin = null;
            }
        }

        // Reject invalid origins
        if (!allowedOrigin) {
            if (debug) console.warn(`[CORS] Rejected origin: ${trimmedOrigin}`);
            return new Response(originNotAllowedError, {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return handlePreflightOrResponse(
            ctx,
            allowedOrigin,
            preflightHeadersBase,
            credentialsHeader,
            exposedHeadersHeader,
            varyHeader,
            debug
        );
    };

    // --- Optimized preflight and response handler ---
    function handlePreflightOrResponse(
        ctx: BurgerContext,
        allowedOrigin: string,
        preflightHeadersBase: Record<string, string>,
        credentialsHeader: Record<string, string>,
        exposedHeadersHeader: Record<string, string>,
        varyHeader: Record<string, string>,
        debug: boolean
    ): BurgerNext {
        // --- Preflight request optimization ---
        if (ctx.method === 'OPTIONS') {
            // Optimize header parsing - avoid unnecessary operations
            const requestedHeadersRaw = ctx.headers.get(
                'Access-Control-Request-Headers'
            );
            let requestedHeaders: string[];

            if (requestedHeadersRaw) {
                // Use split with limit to avoid processing too many headers
                const headers = requestedHeadersRaw.split(',', 20); // Limit to 20 headers max
                requestedHeaders = [];

                // Manual filtering loop (faster than array methods for small arrays)
                for (let i = 0; i < headers.length; i++) {
                    const header = headers[i]!.trim();
                    if (
                        header &&
                        allowedHeadersLower.includes(header.toLowerCase())
                    ) {
                        requestedHeaders.push(header);
                    }
                }

                // Echo requested headers if none match allowed headers (Hono-style)
                if (requestedHeaders.length === 0) {
                    requestedHeaders = [];
                    for (let i = 0; i < headers.length; i++) {
                        const trimmed = headers[i]!.trim();
                        if (trimmed) requestedHeaders.push(trimmed);
                    }
                }
            } else {
                requestedHeaders = allowedHeaders;
            }

            if (debug) {
                console.log('[CORS] Preflight:', {
                    origin: ctx.headers.get('Origin'),
                    allowed: !!allowedOrigin,
                    requestedHeaders,
                });
            }

            // Build response headers efficiently
            const preflightHeaders = {
                'Access-Control-Allow-Origin': allowedOrigin,
                'Access-Control-Allow-Headers': requestedHeaders.join(', '),
                ...preflightHeadersBase,
                ...credentialsHeader,
                ...exposedHeadersHeader,
                ...varyHeader,
            };

            return new Response(null, {
                status: 204,
                headers: preflightHeaders,
            });
        }

        // Normal request - optimized response transformation
        return async (response: Response): Promise<Response> => {
            const headers = new Headers(response.headers);

            // Set headers in optimal order (most common first)
            headers.set('Access-Control-Allow-Origin', allowedOrigin);
            headers.set('Access-Control-Allow-Methods', methodsString);
            headers.set('Access-Control-Allow-Headers', allowedHeadersString);

            // Add Vary header using pre-computed object (empty if wildcard)
            if (varyHeader.Vary) {
                headers.set('Vary', varyHeader.Vary);
            }

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
                    origin: ctx.headers.get('Origin'),
                    allowedOrigin,
                    credentials,
                    exposedHeaders: exposedHeadersString,
                });
            }

            // Reuse response body stream for better memory efficiency
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        };
    }
}
