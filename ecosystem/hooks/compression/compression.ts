import type { BurgerContext, BurgerNext } from 'burger-api';

/**
 * Configuration options for the compression hook.
 */
export interface CompressionOptions {
    /**
     * Minimum response size (in bytes) to compress.
     * Responses smaller than this will not be compressed.
     * @default 1024 (1KB)
     */
    threshold?: number;

    /**
     * Compression algorithms to support in order of preference.
     * Note: Bun currently supports 'gzip' and 'deflate'. Brotli ('br') is not yet supported.
     * @default ['gzip', 'deflate']
     */
    encodings?: ('gzip' | 'deflate' | 'br')[];

    /**
     * Content types to compress. If not specified, compresses all types.
     * Use this to only compress specific MIME types.
     *
     * @default undefined (compress all)
     */
    contentTypes?: string[] | RegExp;

    /**
     * Content types to exclude from compression.
     * Useful for excluding already-compressed formats.
     *
     * @default ['image/', 'video/', 'audio/', 'font/']
     */
    excludeContentTypes?: string[] | RegExp;
}

/**
 * Creates a compression hook for compressing HTTP responses.
 *
 * This hook compresses response bodies using gzip, deflate, or brotli compression
 * based on the client's Accept-Encoding header. It automatically skips compression for:
 * - Small responses (below threshold)
 * - Already compressed content (images, videos, etc.)
 * - Content without a body
 *
 * @param options - Configuration options for compression behavior
 * @returns A hook function that compresses responses
 *
 * @example
 * ```typescript
 * // Basic usage with defaults
 * const compression = compress();
 *
 * // Custom threshold
 * const compression = compress({
 *   threshold: 2048 // Only compress responses larger than 2KB
 * });
 *
 * // Only compress specific content types
 * const compression = compress({
 *   contentTypes: ['text/html', 'application/json', 'text/css', 'application/javascript']
 * });
 *
 * // Prefer brotli if available
 * const compression = compress({
 *   encodings: ['br', 'gzip', 'deflate']
 * });
 * ```
 */
export function compress(options: CompressionOptions = {}): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    const {
        threshold = 1024, // 1KB
        encodings = ['gzip', 'deflate'],
        contentTypes,
        excludeContentTypes = ['image/', 'video/', 'audio/', 'font/'],
    } = options;

    return (ctx: BurgerContext): BurgerNext => {
        const acceptEncoding = ctx.headers.get('Accept-Encoding') || '';

        // Determine which encoding to use based on client support and preference
        let selectedEncoding: 'gzip' | 'deflate' | 'br' | null = null;

        for (const encoding of encodings) {
            if (acceptEncoding.includes(encoding)) {
                selectedEncoding = encoding;
                break;
            }
        }

        // If client doesn't support any of our encodings, don't compress
        if (!selectedEncoding) {
            return undefined;
        }

        // Transform the response to apply compression
        return async (response: Response): Promise<Response> => {
            // Don't compress if already compressed
            if (response.headers.has('Content-Encoding')) {
                return response;
            }

            // Don't compress if no body
            if (!response.body || response.status === 204 || response.status === 304) {
                return response;
            }

            // Check content type
            const contentType = response.headers.get('Content-Type') || '';

            // Skip excluded content types
            if (shouldExcludeContentType(contentType, excludeContentTypes)) {
                return response;
            }

            // Only compress specific content types if specified
            if (contentTypes && !shouldIncludeContentType(contentType, contentTypes)) {
                return response;
            }

            // Read the response body
            const body = await response.arrayBuffer();

            // Don't compress if below threshold
            if (body.byteLength < threshold) {
                return new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
            }

            // Compress the body
            let compressedBody: ArrayBuffer;

            try {
                compressedBody = await compressData(body, selectedEncoding);
            } catch (error) {
                // If compression fails, return original response
                console.error('Compression failed:', error);
                return new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
            }

            // Only use compressed version if it's actually smaller
            const finalBody = compressedBody.byteLength < body.byteLength
                ? compressedBody
                : body;

            const shouldUseCompressed = compressedBody.byteLength < body.byteLength;

            // Create new headers
            const headers = new Headers(response.headers);

            if (shouldUseCompressed) {
                headers.set('Content-Encoding', selectedEncoding);
                headers.set('Vary', 'Accept-Encoding');
            }

            // Update Content-Length
            headers.set('Content-Length', finalBody.byteLength.toString());

            // Remove Content-Length if we're using compressed encoding
            // (some clients prefer to use Transfer-Encoding: chunked)
            if (shouldUseCompressed) {
                headers.delete('Content-Length');
            }

            return new Response(finalBody, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        };
    };
}

/**
 * Compress data using the specified encoding.
 */
async function compressData(
    data: ArrayBuffer,
    encoding: 'gzip' | 'deflate' | 'br'
): Promise<ArrayBuffer> {
    // Check if CompressionStream is available (Bun, Deno, modern browsers)
    if (typeof CompressionStream !== 'undefined') {
        // Note: Bun's CompressionStream currently only supports gzip and deflate
        // Brotli (br) is not yet supported
        if (encoding === 'br') {
            console.warn('Brotli compression not supported in Bun, skipping compression');
            return data;
        }

        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(data));
                controller.close();
            },
        });

        const compressedStream = stream.pipeThrough(
            new CompressionStream(encoding)
        );

        const reader = compressedStream.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // Combine chunks
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return result.buffer;
    }

    // Fallback: If CompressionStream is not available, return original data
    console.warn('CompressionStream not available, skipping compression');
    return data;
}

/**
 * Check if content type should be excluded from compression.
 */
function shouldExcludeContentType(
    contentType: string,
    excludeTypes: string[] | RegExp
): boolean {
    if (excludeTypes instanceof RegExp) {
        return excludeTypes.test(contentType);
    }

    return excludeTypes.some((type) => contentType.startsWith(type));
}

/**
 * Check if content type should be included in compression.
 */
function shouldIncludeContentType(
    contentType: string,
    includeTypes: string[] | RegExp
): boolean {
    if (includeTypes instanceof RegExp) {
        return includeTypes.test(contentType);
    }

    return includeTypes.some((type) => contentType.includes(type));
}

