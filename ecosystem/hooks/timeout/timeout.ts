import type { BurgerContext, BurgerNext } from 'burger-api';

/**
 * Configuration options for the timeout hook.
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
 * Creates a timeout hook that detects slow requests.
 *
 * This hook measures how long the handler takes to complete.
 * If it takes longer than the timeout, it returns a 408 response.
 *
 * Residual risk (documented, not fixed): the 408 is only sent after the
 * handler completes — a hung handler keeps the client waiting until it
 * resolves. Within the current hook contract the transform runs after the
 * handler, so this guard cannot interrupt mid-flight. Full enforcement
 * (AbortController wiring) is deferred; for true timeouts implement them
 * inside handlers using AbortSignal.
 *
 * @param options - Configuration options for timeout behavior
 * @returns A hook function that detects slow requests
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
export function requestTimeout(options: TimeoutOptions = {}): (ctx: BurgerContext) => Promise<BurgerNext> | BurgerNext {
    const {
        ms = 30000, // 30 seconds
        onTimeout,
        message = 'Request timeout',
    } = options;

    const timeoutResponse = (): Response => {
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
    };

    return (ctx: BurgerContext): BurgerNext => {
        // Start timer when the hook runs
        const startTime = Date.now();

        // Return function to check timeout after handler completes
        return async (response: Response): Promise<Response> => {
            const duration = Date.now() - startTime;

            // If the handler hit or exceeded the budget, respond 408
            // instead of the late response.
            if (duration >= ms) {
                return timeoutResponse();
            }

            // Handler completed in time, return normal response
            return response;
        };
    };
}
