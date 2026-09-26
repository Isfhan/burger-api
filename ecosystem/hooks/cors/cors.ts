import type { BurgerContext, ForwardHookResult } from 'burger-api';

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
 * Creates a CORS hook that lets your API be called from other origins by
 * adding the right response headers. Handles preflight `OPTIONS` requests
 * automatically.
 *
 * @param options - Configuration options for CORS behavior
 * @returns A hook function that adds CORS headers to responses
 *
 * @example
 * ```typescript
 * // Allow all origins (default)
 * const corsHook = cors();
 *
 * // Specific origins with credentials
 * const secure = cors({
 *   origin: ['https://example.com', 'https://app.example.com'],
 *   credentials: true
 * });
 * ```
 */
export function cors(options: CorsOptions = {}): (ctx: BurgerContext) => Promise<ForwardHookResult> | ForwardHookResult {
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

    // --- Validate configuration ---
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

    // --- Pre-compute header values ---
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

    // Pre-join header lists once.
    const methodsString = methods.join(', ');
    const allowedHeadersString = allowedHeaders.join(', ');
    const exposedHeadersString =
        exposedHeaders.length > 0 ? exposedHeaders.join(', ') : '';

    const maxAgeString = maxAge.toString();

    // Pre-built header objects.
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

    // Vary: Origin for non-wildcard origins.
    const varyHeader: Record<string, string> = !isWildcard
        ? { Vary: 'Origin' }
        : {};

    // HTTPS enforcement applies in production only.
    const httpRegex =
        enforceHttps && process.env.NODE_ENV === 'production' ? /^http:/ : null;

    // Pre-serialized error responses. Rejections always carry Vary: Origin
    // so caches key on the origin.
    const originNotAllowedError = JSON.stringify({
        success: false,
        error: 'Origin not allowed by CORS policy',
    });
    const insecureOriginError = JSON.stringify({
        success: false,
        error: 'Insecure origin not allowed',
    });
    const forbiddenHeaders = {
        'Content-Type': 'application/json',
        Vary: 'Origin',
    };

    return (ctx: BurgerContext): ForwardHookResult => {
        const requestOrigin = ctx.headers.get('Origin');

        // No Origin header: same-origin request, no CORS headers needed.
        if (!requestOrigin) {
            return undefined;
        }

        // Wildcard origin accepts every request.
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

        if (httpRegex && httpRegex.test(requestOrigin)) {
            if (debug)
                console.warn(
                    `[CORS] Rejected insecure origin: ${requestOrigin}`
                );
            return new Response(insecureOriginError, {
                status: 403,
                headers: forbiddenHeaders,
            });
        }

        // Reject empty origins.
        const trimmedOrigin = requestOrigin.trim();
        if (!trimmedOrigin) {
            if (debug) console.warn('[CORS] Rejected: empty origin header');
            return new Response(originNotAllowedError, {
                status: 403,
                headers: forbiddenHeaders,
            });
        }

        // Resolve the allowed origin.
        let allowedOrigin: string | null = null;
        const requestTrimmedOriginLower = trimmedOrigin.toLowerCase();

        if (isStringOrigin) {
            allowedOrigin =
                stringOriginLower === requestTrimmedOriginLower
                    ? trimmedOrigin
                    : null;
        } else if (isArrayOrigin) {
            // Safe: isArrayOrigin guarantees originArrayLower is non-null.
            allowedOrigin = originArrayLower!.includes(
                requestTrimmedOriginLower
            )
                ? trimmedOrigin
                : null;
        } else if (isFunctionOrigin) {
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

        if (!allowedOrigin) {
            if (debug) console.warn(`[CORS] Rejected origin: ${trimmedOrigin}`);
            return new Response(originNotAllowedError, {
                status: 403,
                headers: forbiddenHeaders,
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

    // --- Preflight and response handler ---
    function handlePreflightOrResponse(
        ctx: BurgerContext,
        allowedOrigin: string,
        preflightHeadersBase: Record<string, string>,
        credentialsHeader: Record<string, string>,
        exposedHeadersHeader: Record<string, string>,
        varyHeader: Record<string, string>,
        debug: boolean
    ): ForwardHookResult {
        // --- Preflight (OPTIONS) ---
        if (ctx.method === 'OPTIONS') {
            const requestedHeadersRaw = ctx.headers.get(
                'Access-Control-Request-Headers'
            );
            let requestedHeaders: string[];

            if (requestedHeadersRaw) {
                const headers = requestedHeadersRaw.split(',', 20); // Cap at 20 headers
                requestedHeaders = [];

                // Only allow headers present in the configured allowlist —
                // never echo arbitrary requested headers back.
                for (let i = 0; i < headers.length; i++) {
                    const header = headers[i]!.trim();
                    if (
                        header &&
                        allowedHeadersLower.includes(header.toLowerCase())
                    ) {
                        requestedHeaders.push(header);
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

        // Non-preflight: add CORS headers to the response.
        return async (response: Response): Promise<Response> => {
            const headers = new Headers(response.headers);

            headers.set('Access-Control-Allow-Origin', allowedOrigin);
            headers.set('Access-Control-Allow-Methods', methodsString);
            headers.set('Access-Control-Allow-Headers', allowedHeadersString);

            // Vary: Origin unless wildcard.
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

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        };
    }
}
