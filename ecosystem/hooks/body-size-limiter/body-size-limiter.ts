import type { Middleware, BurgerRequest, BurgerNext} from 'burger-api';

/**
 * Configuration options for the body size limiter middleware.
 */
export interface BodySizeLimiterOptions {
    /**
     * Maximum allowed body size in bytes.
     * @default 1048576 (1MB)
     */
    maxSize?: number;

    /**
     * Whether to check the Content-Length header only (fast)
     * or actually read and measure the body (accurate but slower).
     * @default 'header' (fast, less accurate)
     */
    mode?: 'header' | 'stream';

    /**
     * Custom error handler for oversized requests.
     * If not provided, returns a default 413 response.
     *
     * @param size - The size of the request body
     * @param maxSize - The maximum allowed size
     * @returns Response to send when body is too large
     */
    onError?: (size: number, maxSize: number) => Response;

    /**
     * Whether to include the limit in error response.
     * @default true
     */
    includeLimit?: boolean;
}

/**
 * Creates a body size limiter middleware to prevent large payload attacks.
 *
 * This middleware checks the size of incoming request bodies and rejects
 * requests that exceed the specified limit. It helps prevent DoS attacks
 * and protects server resources.
 *
 * @param options - Configuration options for body size limiting
 * @returns A middleware function that enforces body size limits
 *
 * @example
 * ```typescript
 * // Default: 1MB limit
 * const bodySizeLimit = bodySizeLimiter();
 *
 * // Custom limit: 10MB
 * const bodySizeLimit = bodySizeLimiter({ maxSize: 10 * 1024 * 1024 });
 *
 * // Strict mode: actually measure body size
 * const bodySizeLimit = bodySizeLimiter({
 *   maxSize: 1024 * 1024,
 *   mode: 'stream'
 * });
 *
 * // Custom error message
 * const bodySizeLimit = bodySizeLimiter({
 *   maxSize: 5 * 1024 * 1024,
 *   onError: (size, max) => Response.json(
 *     {
 *       error: 'Payload too large',
 *       received: `${(size / 1024 / 1024).toFixed(2)}MB`,
 *       maximum: `${(max / 1024 / 1024).toFixed(2)}MB`
 *     },
 *     { status: 413 }
 *   )
 * });
 * ```
 */
export function bodySizeLimiter(options: BodySizeLimiterOptions = {}): Middleware {
    const {
        maxSize = 1048576, // 1MB
        mode = 'header',
        onError = defaultErrorHandler,
        includeLimit = true,
    } = options;

    return async (req: BurgerRequest): Promise<BurgerNext> => {
        // Skip check for methods that typically don't have bodies
        if (['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method)) {
            return undefined;
        }

        if (mode === 'header') {
            // Fast mode: Check Content-Length header only
            const contentLength = req.headers.get('Content-Length');

            if (contentLength) {
                const size = parseInt(contentLength, 10);

                if (isNaN(size)) {
                    return Response.json(
                        { error: 'Invalid Content-Length header' },
                        { status: 400 }
                    );
                }

                if (size > maxSize) {
                    return onError(size, maxSize);
                }
            }
            // If no Content-Length header, we can't check in header mode
            // In production, you might want to require Content-Length header

            return undefined;
        } else {
            // Stream mode: Actually read and measure the body
            // This is more accurate but slower and requires reading the body

            if (!req.body) {
                return undefined; // No body to check
            }

            try {
                // Read the body as array buffer
                const bodyBuffer = await req.arrayBuffer();
                const size = bodyBuffer.byteLength;

                if (size > maxSize) {
                    return onError(size, maxSize);
                }

                // Recreate request with the consumed body
                // Note: This might not work perfectly with all request types
                // For production, consider using a streaming approach
                (req as any)._bodyBuffer = bodyBuffer;

                return undefined;
            } catch (error) {
                console.error('Error reading request body:', error);
                return Response.json(
                    { error: 'Error reading request body' },
                    { status: 400 }
                );
            }
        }
    };
}

/**
 * Default error handler for oversized requests.
 */
function defaultErrorHandler(size: number, maxSize: number): Response {
    const sizeInMB = (size / 1024 / 1024).toFixed(2);
    const maxSizeInMB = (maxSize / 1024 / 1024).toFixed(2);

    return Response.json(
        {
            error: 'Payload Too Large',
            message: `Request body exceeds maximum allowed size`,
            received: `${sizeInMB}MB`,
            maximum: `${maxSizeInMB}MB`,
        },
        {
            status: 413,
            statusText: 'Payload Too Large',
            headers: {
                'Connection': 'close',
            },
        }
    );
}

/**
 * Preset: Small payloads (100KB) - for text-based APIs
 */
export function smallPayloadLimit(): Middleware {
    return bodySizeLimiter({ maxSize: 102400 }); // 100KB
}

/**
 * Preset: Medium payloads (1MB) - default, good for most APIs
 */
export function mediumPayloadLimit(): Middleware {
    return bodySizeLimiter({ maxSize: 1048576 }); // 1MB
}

/**
 * Preset: Large payloads (10MB) - for file uploads
 */
export function largePayloadLimit(): Middleware {
    return bodySizeLimiter({ maxSize: 10485760 }); // 10MB
}

/**
 * Preset: Extra large payloads (50MB) - for large file uploads
 */
export function extraLargePayloadLimit(): Middleware {
    return bodySizeLimiter({ maxSize: 52428800 }); // 50MB
}

/**
 * Helper: Convert bytes to human-readable format
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

