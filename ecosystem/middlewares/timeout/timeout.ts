import type { Middleware, BurgerRequest, BurgerNext } from 'burger-api';

/**
 * Configuration options for the timeout middleware.
 */
export interface TimeoutOptions {
    /**
     * Timeout duration in milliseconds.
     * @default 30000 (30 seconds)
     */
    ms?: number;

    /**
     * Custom error handler for timeout.
     * If not provided, returns a default 408 response.
     *
     * @returns Response to send when timeout occurs
     */
    onTimeout?: () => Response;

    /**
     * Custom message for timeout error.
     * @default 'Request timeout'
     */
    message?: string;
}

/**
 * Creates a timeout middleware that detects slow requests.
 *
 * This middleware measures how long the handler takes to complete.
 * If it takes longer than the timeout, it returns a 408 response.
 *
 * Note: This detects timeouts AFTER the handler completes.
 * The handler will still run to completion even if it exceeds the timeout.
 * For true timeout enforcement that stops handlers mid-execution,
 * implement timeout logic inside your handlers using AbortSignal.
 *
 * @param options - Configuration options for timeout behavior
 * @returns A middleware function that detects slow requests
 *
 * @example
 * ```typescript
 * // Basic usage: detect requests taking longer than 30 seconds
 * const timeout = requestTimeout();
 *
 * // Custom timeout duration
 * const timeout = requestTimeout({ ms: 5000 }); // 5 seconds
 *
 * // Custom error response
 * const timeout = requestTimeout({
 *   ms: 10000,
 *   onTimeout: () => Response.json(
 *     { error: 'Request took too long' },
 *     { status: 408 }
 *   )
 * });
 * ```
 */
export function requestTimeout(options: TimeoutOptions = {}): Middleware {
    const {
        ms = 30000, // 30 seconds
        onTimeout,
        message = 'Request timeout',
    } = options;

    return (req: BurgerRequest): BurgerNext => {
        // Start timer when middleware runs
        const startTime = Date.now();

        // Return function to check timeout after handler completes
        return async (response: Response): Promise<Response> => {
            const duration = Date.now() - startTime;

            // If handler took too long, return timeout response
            if (duration > ms) {
                if (onTimeout) {
                    return onTimeout();
                }

                return Response.json(
                    {
                        error: 'Request Timeout',
                        message,
                    },
                    {
                        status: 408,
                        statusText: 'Request Timeout',
                    }
                );
            }

            // Handler completed in time, return normal response
            return response;
        };
    };
}
