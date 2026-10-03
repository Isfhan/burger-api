import type { BurgerContext, ForwardHookResult } from 'burger-api';

/**
 * Configuration options for the body size limiter hook.
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
 * Creates a hook that rejects request bodies over `maxSize` (default 1MB)
 * to protect against oversized-payload attacks. Header mode checks
 * `Content-Length`; stream mode measures the body itself.
 *
 * @param options - Configuration options for body size limiting
 * @returns A hook function that enforces body size limits
 *
 * @example
 * ```typescript
 * // Default: 1MB limit
 * const bodySizeLimit = bodySizeLimiter();
 *
 * // Custom limit: 10MB
 * const bodySizeLimit = bodySizeLimiter({ maxSize: 10 * 1024 * 1024 });
 *
 * // Measure the body even without a Content-Length header
 * const strictLimit = bodySizeLimiter({ mode: 'stream' });
 * ```
 */
export function bodySizeLimiter(options: BodySizeLimiterOptions = {}): (ctx: BurgerContext) => Promise<ForwardHookResult> | ForwardHookResult {
    const {
        maxSize = 1048576, // 1MB
        mode = 'header',
        onError,
        includeLimit = true,
    } = options;

    // A custom handler owns the body; `includeLimit` applies to the default.
    const errorHandler =
        onError ??
        ((size: number, max: number) =>
            defaultErrorHandler(size, max, includeLimit));

    // Warn once per limiter when stream mode runs after the body was read.
    let warnedBodyUsed = false;

    return async (ctx: BurgerContext): Promise<ForwardHookResult> => {
        // Skip check for methods that typically don't have bodies
        if (['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(ctx.method)) {
            return undefined;
        }

        if (mode === 'header') {
            // Fast mode: Check Content-Length header only
            const contentLength = ctx.headers.get('Content-Length');

            if (contentLength !== null) {
                if (!/^\d+$/.test(contentLength)) {
                    return Response.json(
                        { error: 'Invalid Content-Length header' },
                        { status: 400 }
                    );
                }

                const size = Number(contentLength);

                if (size > maxSize) {
                    return errorHandler(size, maxSize);
                }
            } else if (ctx.body !== null) {
                // A body without a trustworthy Content-Length (e.g. chunked
                // encoding) can't be measured in header mode — require the
                // header instead of letting an unbounded body through.
                return Response.json(
                    { error: 'Content-Length header required' },
                    { status: 411 }
                );
            }

            return undefined;
        } else {
            // Stream mode: measure a CLONE of the body in bounded chunks,
            // so the original stays readable for validation and the handler.
            // At most `maxSize` bytes (plus one chunk) are buffered; an
            // oversized body is aborted mid-stream.

            if (!ctx.body) {
                return undefined; // No body to check
            }

            if (ctx.bodyUsed) {
                // Body validation (or another hook) already read the whole
                // body — measuring now protects nothing.
                if (!warnedBodyUsed) {
                    warnedBodyUsed = true;
                    console.warn(
                        "[burger-api/body-size-limiter] The request body was already read before the limiter ran (mode: 'stream'). " +
                            'Register bodySizeLimiter() in `onRequest` so it runs before body validation.'
                    );
                }
                return undefined;
            }

            let size = 0;

            try {
                const reader = ctx.request.clone().body!.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }
                    if (value) {
                        size += value.byteLength;
                        if (size > maxSize) {
                            await reader.cancel();
                            return errorHandler(size, maxSize);
                        }
                    }
                }

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
 * Default error handler for oversized requests. `includeLimit: false` keeps
 * the error shape but omits the received/maximum sizes.
 */
function defaultErrorHandler(
    size: number,
    maxSize: number,
    includeLimit = true
): Response {
    const body: Record<string, string> = {
        error: 'Payload Too Large',
        message: `Request body exceeds maximum allowed size`,
    };
    if (includeLimit) {
        body.received = `${(size / 1024 / 1024).toFixed(2)}MB`;
        body.maximum = `${(maxSize / 1024 / 1024).toFixed(2)}MB`;
    }

    return Response.json(body, {
        status: 413,
        statusText: 'Payload Too Large',
        headers: {
            'Connection': 'close',
        },
    });
}

/**
 * Preset: Small payloads (100KB) - for text-based APIs
 */
export function smallPayloadLimit(): (ctx: BurgerContext) => Promise<ForwardHookResult> | ForwardHookResult {
    return bodySizeLimiter({ maxSize: 102400 }); // 100KB
}

/**
 * Preset: Medium payloads (1MB) - default, good for most APIs
 */
export function mediumPayloadLimit(): (ctx: BurgerContext) => Promise<ForwardHookResult> | ForwardHookResult {
    return bodySizeLimiter({ maxSize: 1048576 }); // 1MB
}

/**
 * Preset: Large payloads (10MB) - for file uploads
 */
export function largePayloadLimit(): (ctx: BurgerContext) => Promise<ForwardHookResult> | ForwardHookResult {
    return bodySizeLimiter({ maxSize: 10485760 }); // 10MB
}

/**
 * Preset: Extra large payloads (50MB) - for large file uploads
 */
export function extraLargePayloadLimit(): (ctx: BurgerContext) => Promise<ForwardHookResult> | ForwardHookResult {
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

