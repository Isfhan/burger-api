import type { Middleware, BurgerRequest, BurgerNext } from 'burger-api';

/**
 * Configuration options for the API key authentication middleware.
 */
export interface APIKeyAuthOptions {
    /**
     * Valid API keys. Can be a Set, Array, or async function.
     * 
     * @example
     * ```typescript
     * // Static keys
     * keys: ['key1', 'key2', 'key3']
     * 
     * // Or Set
     * keys: new Set(['key1', 'key2'])
     * 
     * // Or async validation
     * keys: async (key) => {
     *   const valid = await database.validateAPIKey(key);
     *   return valid;
     * }
     * ```
     */
    keys: Set<string> | string[] | ((key: string) => Promise<boolean> | boolean);

    /**
     * Header name to check for the API key.
     * @default 'X-API-Key'
     */
    header?: string;

    /**
     * Query parameter name to check for the API key.
     * If specified, checks query params as a fallback.
     * @default undefined (only check header)
     */
    queryParam?: string;

    /**
     * Custom function to extract the API key from the request.
     * If provided, overrides the default extraction logic.
     *
     * @param req - The request object
     * @returns The API key or null if not found
     */
    getKey?: (req: BurgerRequest) => string | null;

    /**
     * Custom error handler for authentication failures.
     * If not provided, returns a default 401 response.
     *
     * @param reason - The reason for authentication failure
     * @returns Response to send when authentication fails
     */
    onError?: (reason: string) => Response;

    /**
     * Property name to attach API key metadata to the request object.
     * @default 'apiKey'
     */
    requestProperty?: string;

    /**
     * Whether to expose the API key in error messages.
     * For security, this should be false in production.
     * @default false
     */
    exposeKeyInError?: boolean;
}

/**
 * Creates an API key authentication middleware for protecting routes.
 *
 * This middleware verifies API keys from the X-API-Key header or query parameters.
 * It supports static keys, dynamic validation, and custom extraction logic.
 *
 * @param options - Configuration options for API key authentication
 * @returns A middleware function that authenticates requests
 *
 * @example
 * ```typescript
 * // Static keys
 * const apiKeyAuth = apiKey({
 *   keys: ['key1', 'key2', 'key3']
 * });
 *
 * // With database validation
 * const apiKeyAuth = apiKey({
 *   keys: async (key) => {
 *     const apiKey = await db.query('SELECT * FROM api_keys WHERE key = ?', [key]);
 *     return apiKey !== null;
 *   }
 * });
 *
 * // Custom header
 * const apiKeyAuth = apiKey({
 *   keys: ['key1', 'key2'],
 *   header: 'Authorization',
 *   getKey: (req) => {
 *     const auth = req.headers.get('Authorization');
 *     return auth?.startsWith('ApiKey ') ? auth.substring(7) : null;
 *   }
 * });
 * ```
 */
export function apiKey(options: APIKeyAuthOptions): Middleware {
    const {
        keys,
        header = 'X-API-Key',
        queryParam,
        getKey,
        onError = defaultErrorHandler,
        requestProperty = 'apiKey',
        exposeKeyInError = false,
    } = options;

    // Convert keys to Set for faster lookups if it's an array
    const keysSet = Array.isArray(keys) ? new Set(keys) : keys;

    return async (req: BurgerRequest): Promise<BurgerNext> => {
        // Extract API key from request
        let key: string | null = null;

        if (getKey) {
            // Use custom key extractor
            key = getKey(req);
        } else {
            // Default key extraction logic
            // 1. Check specified header
            key = req.headers.get(header);

            // 2. Check query parameter if specified
            if (!key && queryParam) {
                const url = new URL(req.url);
                key = url.searchParams.get(queryParam);
            }
        }

        // If no key found, return 401
        if (!key) {
            return onError('No API key provided');
        }

        // Validate the API key
        let isValid = false;

        if (typeof keysSet === 'function') {
            // Async validation function
            try {
                isValid = await keysSet(key);
            } catch (error) {
                console.error('API key validation error:', error);
                return onError('API key validation failed');
            }
        } else {
            // Set or array lookup
            isValid = keysSet.has(key);
        }

        if (!isValid) {
            const errorMessage = exposeKeyInError
                ? `Invalid API key: ${key}`
                : 'Invalid API key';
            return onError(errorMessage);
        }

        // Attach API key to request
        (req as any)[requestProperty] = key;

        // Continue to next middleware/handler
        return undefined;
    };
}

/**
 * Default error handler for authentication failures.
 */
function defaultErrorHandler(reason: string): Response {
    return Response.json(
        {
            error: 'Unauthorized',
            message: reason,
        },
        {
            status: 401,
            statusText: 'Unauthorized',
            headers: {
                'WWW-Authenticate': 'ApiKey',
            },
        }
    );
}

/**
 * Creates an API key middleware with rate limiting per key.
 * Combines API key auth with per-key rate limiting.
 */
export function apiKeyWithRateLimit(
    authOptions: APIKeyAuthOptions,
    rateLimit: {
        windowMs?: number;
        maxRequests?: number;
    } = {}
): Middleware {
    const { windowMs = 60000, maxRequests = 100 } = rateLimit;

    // Store for tracking requests per API key
    const requestStore = new Map<
        string,
        { count: number; resetTime: number }
    >();

    // Create base API key auth middleware
    const baseAuth = apiKey(authOptions);

    return async (req: BurgerRequest): Promise<BurgerNext> => {
        // First, authenticate the API key
        const authResult = await baseAuth(req);
        if (authResult instanceof Response) {
            return authResult; // Authentication failed
        }

        // Get the validated API key
        const key = (req as any)[authOptions.requestProperty || 'apiKey'];

        // Check rate limit for this specific API key
        const now = Date.now();
        let record = requestStore.get(key);

        if (!record || now > record.resetTime) {
            // Create new record
            record = {
                count: 0,
                resetTime: now + windowMs,
            };
            requestStore.set(key, record);
        }

        // Increment request count
        record.count++;

        // Check if rate limit exceeded
        if (record.count > maxRequests) {
            return Response.json(
                {
                    error: 'Rate Limit Exceeded',
                    message: `You have exceeded the rate limit for this API key`,
                    retryAfter: Math.ceil((record.resetTime - now) / 1000),
                },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': maxRequests.toString(),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': Math.ceil(record.resetTime / 1000).toString(),
                        'Retry-After': Math.ceil((record.resetTime - now) / 1000).toString(),
                    },
                }
            );
        }

        // Add rate limit headers to response
        return (response: Response): Promise<Response> => {
            const headers = new Headers(response.headers);
            headers.set('X-RateLimit-Limit', maxRequests.toString());
            headers.set(
                'X-RateLimit-Remaining',
                (maxRequests - record!.count).toString()
            );
            headers.set('X-RateLimit-Reset', Math.ceil(record!.resetTime / 1000).toString());

            return Promise.resolve(
                new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                })
            );
        };
    };
}

