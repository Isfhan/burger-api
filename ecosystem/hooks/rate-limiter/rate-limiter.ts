import type { BurgerContext, BurgerNext } from 'burger-api';

/**
 * Configuration options for the rate limiter middleware.
 */
export interface RateLimiterOptions {
    /**
     * Time window in milliseconds for rate limiting.
     * @default 60000 (1 minute)
     */
    windowMs?: number;

    /**
     * Maximum number of requests allowed per window.
     * @default 100
     */
    maxRequests?: number;

    /**
     * Custom key generator function to identify clients.
     * By default, uses the client's IP address.
     *
     * @param req - The request object
     * @returns A unique identifier for the client
     */
    keyGenerator?: (ctx: BurgerContext) => string;

    /**
     * Custom handler for when rate limit is exceeded.
     * If not provided, returns a default 429 response.
     *
     * @param req - The request object
     * @returns Response to send when rate limit is exceeded
     */
    handler?: (ctx: BurgerContext) => Response;

    /**
     * Whether to skip failed requests (requests that throw errors).
     * If true, failed requests won't count against the rate limit.
     * @default false
     */
    skipFailedRequests?: boolean;

    /**
     * Whether to skip successful requests (2xx status codes).
     * If true, only failed requests count against the rate limit.
     * @default false
     */
    skipSuccessfulRequests?: boolean;
}

interface RateLimitRecord {
    count: number;
    resetTime: number;
}

/**
 * Creates a rate limiter middleware to prevent API abuse.
 *
 * This middleware tracks the number of requests from each client within a time window
 * and blocks requests that exceed the specified limit. It uses an in-memory store
 * to track request counts.
 *
 * @param options - Configuration options for rate limiting
 * @returns A middleware function that enforces rate limits
 *
 * @example
 * ```typescript
 * // Basic usage: 100 requests per minute
 * const rateLimiter = rateLimit();
 *
 * // Custom limits
 * const rateLimiter = rateLimit({
 *   windowMs: 15 * 60 * 1000, // 15 minutes
 *   maxRequests: 50
 * });
 *
 * // Custom key generator (e.g., by API key)
 * const rateLimiter = rateLimit({
 *   keyGenerator: (ctx) => ctx.headers.get('X-API-Key') || 'anonymous'
 * });
 *
 * // Custom error response
 * const rateLimiter = rateLimit({
 *   handler: (ctx) => Response.json(
 *     { error: 'Too many requests, please try again later' },
 *     { status: 429 }
 *   )
 * });
 * ```
 */
export function rateLimit(options: RateLimiterOptions = {}): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    const {
        windowMs = 60000, // 1 minute
        maxRequests = 100,
        keyGenerator = defaultKeyGenerator,
        handler = defaultHandler,
        skipFailedRequests = false,
        skipSuccessfulRequests = false,
    } = options;

    // In-memory store for rate limit records
    const store = new Map<string, RateLimitRecord>();

    // Cleanup old entries periodically (every minute)
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of store.entries()) {
            if (now > record.resetTime) {
                store.delete(key);
            }
        }
    }, 60000);

    // Clean up interval on process exit (for proper cleanup in tests)
    // Works in both Node.js and Bun.js
    if (typeof process !== 'undefined' && process.on) {
        try {
            process.on('exit', () => clearInterval(cleanupInterval));
        } catch {
            // Ignore if process.on is not available
        }
    }

    return (ctx: BurgerContext): BurgerNext => {
        const key = keyGenerator(ctx);
        const now = Date.now();

        // Get or create rate limit record
        let record = store.get(key);

        if (!record || now > record.resetTime) {
            // Create new record
            record = {
                count: 0,
                resetTime: now + windowMs,
            };
            store.set(key, record);
        }

        // Increment request count
        record.count++;

        // Calculate remaining requests
        const remaining = Math.max(0, maxRequests - record.count);
        const resetTime = record.resetTime;

        // Check if rate limit is exceeded
        if (record.count > maxRequests) {
            // Return 429 Too Many Requests
            const response = handler(ctx);
            const headers = new Headers(response.headers);

            // Add rate limit headers
            headers.set('X-RateLimit-Limit', maxRequests.toString());
            headers.set('X-RateLimit-Remaining', '0');
            headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
            headers.set('Retry-After', Math.ceil((resetTime - now) / 1000).toString());

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        }

        // If we should skip counting certain requests, we need to transform the response
        if (skipFailedRequests || skipSuccessfulRequests) {
            return async (response: Response): Promise<Response> => {
                const shouldSkip =
                    (skipFailedRequests && response.status >= 400) ||
                    (skipSuccessfulRequests && response.status >= 200 && response.status < 300);

                if (shouldSkip) {
                    // Decrement the count since we're skipping this request
                    record!.count--;
                }

                // Add rate limit headers to response
                const headers = new Headers(response.headers);
                headers.set('X-RateLimit-Limit', maxRequests.toString());
                headers.set('X-RateLimit-Remaining', Math.max(0, maxRequests - record!.count).toString());
                headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                });
            };
        }

        // Add rate limit headers to response for allowed requests
        return (response: Response): Promise<Response> => {
            const headers = new Headers(response.headers);
            headers.set('X-RateLimit-Limit', maxRequests.toString());
            headers.set('X-RateLimit-Remaining', remaining.toString());
            headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());

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

/**
 * Hash a key using Bun's optimized CryptoHasher if available.
 * Falls back to a simple hash for other runtimes.
 */
function hashKey(key: string): string {
    // Use Bun's optimized CryptoHasher if available (much faster than crypto.subtle)
    if (typeof Bun !== 'undefined' && Bun.CryptoHasher) {
        try {
            const hasher = new Bun.CryptoHasher('sha256');
            hasher.update(key);
            // Use first 16 chars for efficient storage
            return hasher.digest('hex').slice(0, 16);
        } catch {
            // Fallback if CryptoHasher fails
        }
    }
    
    // Simple fallback hash for non-Bun runtimes or if CryptoHasher fails
    // Note: This is not cryptographically secure, but fine for rate limiting
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
}

/**
 * Default key generator that extracts the client's IP address.
 */
function defaultKeyGenerator(ctx: BurgerContext): string {
    // Try to get real IP from common proxy headers
    const forwarded = ctx.headers.get('X-Forwarded-For');
    if (forwarded) {
        const ip = forwarded.split(',')[0].trim();
        // Hash the IP for privacy (optional, but recommended)
        return hashKey(ip);
    }

    const realIp = ctx.headers.get('X-Real-IP');
    if (realIp) {
        return hashKey(realIp);
    }

    // Fallback to a generic identifier
    return 'unknown';
}

/**
 * Default handler for rate limit exceeded.
 */
function defaultHandler(_ctx: BurgerContext): Response {
    return Response.json(
        {
            error: 'Too Many Requests',
            message: 'You have exceeded the rate limit. Please try again later.',
        },
        {
            status: 429,
            statusText: 'Too Many Requests',
        }
    );
}

