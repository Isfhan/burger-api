import type { BurgerContext, ForwardHookResult } from 'burger-api';

/**
 * Configuration options for the timeout hook / handler wrapper.
 */
export interface TimeoutOptions {
    /**
     * Timeout duration in milliseconds.
     * @default 30000 (30 seconds)
     */
    ms?: number;

    /**
     * Custom error handler for timeout.
     * If not provided, the guard hook returns 408 and {@link withTimeout}
     * returns 504.
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
 * Creates a timeout GUARD hook that replaces late responses with 408.
 *
 * Limitation: lifecycle hooks cannot wrap the handler — a `beforeRoute`
 * hook runs before it and its after-mapper only runs once the handler has
 * finished. So this hook cannot respond AT the deadline: a slow handler
 * still keeps the client waiting until it resolves, and only then is its
 * response swapped for a 408. To actually respond at the deadline with a
 * 504, wrap the handler with {@link withTimeout} in `route.ts`.
 *
 * @param options - Configuration options for timeout behavior
 * @returns A hook function that replaces over-budget responses with 408
 *
 * @example
 * ```typescript
 * // src/hooks.ts
 * export const beforeRoute = [requestTimeout({ ms: 5000 })];
 * ```
 */
export function requestTimeout(options: TimeoutOptions = {}): (ctx: BurgerContext) => Promise<ForwardHookResult> | ForwardHookResult {
    const { ms = 30000 } = options;
    const timeoutResponse = createTimeoutResponse(options);

    return (_ctx: BurgerContext): ForwardHookResult => {
        // Start timer when the hook runs
        const startTime = Date.now();

        // Return function to check timeout after handler completes
        return async (response: Response): Promise<Response> => {
            // Over budget: replace the late response.
            if (Date.now() - startTime >= ms) {
                return timeoutResponse();
            }
            return response;
        };
    };
}

/**
 * Wraps a route handler so the client gets a 504 **at the deadline**.
 *
 * The handler receives a second argument, an `AbortSignal` that aborts at
 * the deadline (or when the client disconnects). JavaScript cannot cancel a
 * running function: after the 504 is sent the handler keeps running in the
 * background unless it passes the signal on (e.g. `fetch(url, { signal })`)
 * or checks `signal.aborted`.
 *
 * @example
 * ```typescript
 * // src/api/report/route.ts
 * import { withTimeout } from '../../../ecosystem/hooks/timeout/timeout';
 *
 * export const GET = withTimeout(async (ctx, signal) => {
 *     const res = await fetch('https://slow.example.com/data', { signal });
 *     return Response.json(await res.json());
 * }, { ms: 5000 });
 * ```
 */
export function withTimeout<C extends BurgerContext = BurgerContext>(
    handler: (ctx: C, signal: AbortSignal) => Response | Promise<Response>,
    options: TimeoutOptions = {}
): (ctx: C) => Promise<Response> {
    const { ms = 30000 } = options;
    const timeoutResponse = createDeadlineResponse(options);

    return async (ctx: C): Promise<Response> => {
        const controller = new AbortController();
        const signal = AbortSignal.any([ctx.signal, controller.signal]);

        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), ms);
        });

        const work = Promise.resolve().then(() => handler(ctx, signal));

        try {
            const winner = await Promise.race([work, deadline]);
            if (winner !== 'timeout') {
                return winner;
            }
        } finally {
            clearTimeout(timer);
        }

        // Deadline hit: tell the handler to stop, respond now. A late
        // failure must not become an unhandled rejection; an abort error
        // caused by our own signal is expected and not logged.
        controller.abort(new Error(`Handler exceeded ${ms}ms timeout`));
        work.catch((error: unknown) => {
            if (error !== signal.reason && (error as Error)?.name !== 'AbortError') {
                console.error('[burger-api/timeout] Handler failed after its timeout response was sent:', error);
            }
        });
        return timeoutResponse();
    };
}

/** 408 builder for the guard hook (its response is sent after the handler). */
function createTimeoutResponse(options: TimeoutOptions): () => Response {
    const { onTimeout, message = 'Request timeout' } = options;
    return (): Response => {
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
}

/** 504 builder for {@link withTimeout} (sent exactly at the deadline). */
function createDeadlineResponse(options: TimeoutOptions): () => Response {
    const { onTimeout, message = 'Request timeout' } = options;
    return (): Response => {
        if (onTimeout) {
            return onTimeout();
        }
        return Response.json(
            {
                error: 'Gateway Timeout',
                message,
            },
            {
                status: 504,
                statusText: 'Gateway Timeout',
            }
        );
    };
}
