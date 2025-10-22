import type { Middleware, BurgerRequest, BurgerNext } from 'burger-api';

/**
 * Configuration options for the CORS middleware.
 */
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
    origin?: string | string[] | ((origin: string) => boolean);

    /**
     * Configures the Access-Control-Allow-Methods header.
     * Specifies which HTTP methods are allowed when accessing the resource.
     *
     * @default ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
     */
    methods?: string[];

    /**
     * Configures the Access-Control-Allow-Headers header.
     * Specifies which headers can be used during the actual request.
     *
     * @default ['Content-Type', 'Authorization']
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
 * // Allow specific origin
 * const corsMiddleware = cors({
 *   origin: 'https://example.com',
 *   credentials: true
 * });
 *
 * // Allow multiple origins
 * const corsMiddleware = cors({
 *   origin: ['https://example.com', 'https://app.example.com']
 * });
 *
 * // Custom origin validation
 * const corsMiddleware = cors({
 *   origin: (origin) => origin.endsWith('.example.com')
 * });
 * ```
 */
export function cors(options: CorsOptions = {}): Middleware {
    const {
        origin = '*',
        methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders = ['Content-Type', 'Authorization'],
        exposedHeaders = [],
        credentials = false,
        maxAge = 600,
    } = options;

    return (req: BurgerRequest): BurgerNext => {
        // Get the request origin
        const requestOrigin = req.headers.get('Origin') || '';

        // Determine the allowed origin
        let allowedOrigin = '*';

        if (typeof origin === 'string') {
            allowedOrigin = origin;
        } else if (Array.isArray(origin)) {
            // Check if request origin is in the allowed list
            if (requestOrigin && origin.includes(requestOrigin)) {
                allowedOrigin = requestOrigin;
            } else {
                allowedOrigin = origin[0] || '*';
            }
        } else if (typeof origin === 'function') {
            // Use custom validation function
            if (requestOrigin && origin(requestOrigin)) {
                allowedOrigin = requestOrigin;
            } else {
                // If validation fails, don't allow the origin
                allowedOrigin = 'null';
            }
        }

        // Handle preflight OPTIONS requests
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': allowedOrigin,
                    'Access-Control-Allow-Methods': methods.join(', '),
                    'Access-Control-Allow-Headers': allowedHeaders.join(', '),
                    'Access-Control-Max-Age': maxAge.toString(),
                    ...(credentials && {
                        'Access-Control-Allow-Credentials': 'true',
                    }),
                    ...(exposedHeaders.length > 0 && {
                        'Access-Control-Expose-Headers': exposedHeaders.join(', '),
                    }),
                },
            });
        }

        // For other requests, add CORS headers to the response
        return (response: Response): Promise<Response> => {
            const headers = new Headers(response.headers);

            headers.set('Access-Control-Allow-Origin', allowedOrigin);
            headers.set('Access-Control-Allow-Methods', methods.join(', '));
            headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));

            if (credentials) {
                headers.set('Access-Control-Allow-Credentials', 'true');
            }

            if (exposedHeaders.length > 0) {
                headers.set(
                    'Access-Control-Expose-Headers',
                    exposedHeaders.join(', ')
                );
            }

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

