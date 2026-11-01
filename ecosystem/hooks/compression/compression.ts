import type { BurgerContext, ForwardHookResult } from 'burger-api';

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
     * Note: this hook implements 'gzip' and 'deflate'; a 'br' entry is
     * skipped with a warning and the response is sent uncompressed.
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
 * Creates a hook that gzip/deflate-compresses response bodies based on the
 * client's `Accept-Encoding`. Skips small responses, bodiless responses,
 * already-compressed content, and excluded content types. Brotli requests
 * are skipped with a warning.
 *
 * @param options - Configuration options for compression behavior
 * @returns A hook function that compresses responses
 *
 * @example
 * ```typescript
 * // Basic usage with defaults
 * const compression = compress();
 *
 * // Only compress responses larger than 2KB
 * const compression = compress({ threshold: 2048 });
 *
 * // Only compress specific content types
 * const compression = compress({
 *   contentTypes: ['text/html', 'application/json', 'text/css', 'application/javascript']
 * });
 * ```
 */
export function compress(options: CompressionOptions = {}): (ctx: BurgerContext) => Promise<ForwardHookResult> | ForwardHookResult {
    const {
        threshold = 1024, // 1KB
        encodings = ['gzip', 'deflate'],
        contentTypes,
        excludeContentTypes = ['image/', 'video/', 'audio/', 'font/'],
    } = options;

    return (ctx: BurgerContext): ForwardHookResult => {
        const acceptEncoding = ctx.headers.get('Accept-Encoding') || '';

        // Pick the first configured encoding the client accepts.
        let selectedEncoding: 'gzip' | 'deflate' | 'br' | null = null;

        for (const encoding of encodings) {
            if (acceptEncoding.includes(encoding)) {
                selectedEncoding = encoding;
                break;
            }
        }

        if (!selectedEncoding) {
            return undefined;
        }

        return async (response: Response): Promise<Response> => {
            // Skip already compressed responses.
            if (response.headers.has('Content-Encoding')) {
                return response;
            }

            // Skip responses with no body.
            if (!response.body || response.status === 204 || response.status === 304) {
                return response;
            }

            const contentType = response.headers.get('Content-Type') || '';

            // Apply the exclude list, and the include list when one is set.
            if (shouldExcludeContentType(contentType, excludeContentTypes)) {
                return response;
            }

            if (contentTypes && !shouldIncludeContentType(contentType, contentTypes)) {
                return response;
            }

            const body = await response.arrayBuffer();

            // Skip responses below the threshold.
            if (body.byteLength < threshold) {
                return new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
            }

            let compressedBody: ArrayBuffer;

            try {
                compressedBody = await compressData(body, selectedEncoding);
            } catch (error) {
                // Compression failed: send the original body.
                console.error('Compression failed:', error);
                return new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
            }

            // Only use the compressed body if it's actually smaller.
            const finalBody = compressedBody.byteLength < body.byteLength
                ? compressedBody
                : body;

            const shouldUseCompressed = compressedBody.byteLength < body.byteLength;

            const headers = new Headers(response.headers);

            if (shouldUseCompressed) {
                headers.set('Content-Encoding', selectedEncoding);
                headers.set('Vary', 'Accept-Encoding');
            }

            headers.set('Content-Length', finalBody.byteLength.toString());

            // Compressed responses are left without Content-Length so they
            // can be sent chunked.
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
    // Available on Bun, Deno and modern browsers.
    if (typeof CompressionStream !== 'undefined') {
        // This hook does not implement Brotli: warn and send the body
        // uncompressed.
        if (encoding === 'br') {
            console.warn(
                '[burger-api/compression] Brotli (br) is not supported by this hook, skipping compression'
            );
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

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return result.buffer;
    }

    // No CompressionStream: send the body uncompressed.
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

