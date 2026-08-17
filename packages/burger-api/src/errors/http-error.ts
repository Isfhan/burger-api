/**
 * The base HTTP error class for BurgerAPI (vision §14).
 *
 * All framework error classes extend this. Each subclass sets a static
 * `status` code and a default `name`. The `onError` pipeline catches
 * these and renders RFC 9457 Problem Details by default.
 *
 * Subclasses: ValidationError (422), NotFoundError (404),
 * UnauthorizedError (401), ForbiddenError (403), MethodNotAllowedError (405).
 */

export class HTTPError extends Error {
    /** HTTP status code for this error. */
    readonly status: number;

    constructor(status: number, message: string, options?: ErrorOptions) {
        super(message, options);
        this.status = status;
        this.name = 'HTTPError';
    }
}

/**
 * Renders any `HTTPError` (or subclass) into an RFC 9457 Problem Details
 * response (`application/problem+json`).
 *
 * - In dev mode, includes `stack` and `cause` chain.
 * - In production, only `type`, `title`, `status`, `detail` are emitted,
 *   and 500 responses always carry the fixed `Internal Server Error`
 *   detail — a thrown message is never echoed to clients.
 * - Unknown (non-HTTPError) errors are wrapped in `HTTPError(500)`.
 * - The status is clamped to the HTTP range (100-599, integer); anything
 *   else renders as 500 instead of escaping as a `RangeError`.
 *
 * @param error The error to render.
 * @param isDev Whether to include dev diagnostics (stack, cause).
 * @param extras Optional extra members merged into the problem body (e.g.
 * `{ errors }` for validation failures). Spread after the defaults, so they
 * can override `title`/`detail`.
 */
export function renderHTTPError(
    error: unknown,
    isDev: boolean,
    extras?: Record<string, unknown>
): Response {
    const httpError =
        error instanceof HTTPError ||
        (error !== null &&
            typeof error === 'object' &&
            'status' in (error as object) &&
            typeof (error as Record<string, unknown>).status === 'number')
            ? (error as HTTPError)
            : new HTTPError(
                  500,
                  'Internal Server Error',
                  error instanceof Error ? { cause: error } : undefined
              );

    // Clamp to a valid HTTP status; garbage must render as 500, never
    // escape as a `RangeError` from the `Response` constructor.
    const rawStatus = httpError.status;
    const status =
        Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599
            ? rawStatus
            : 500;

    const problem: Record<string, unknown> = {
        type: 'about:blank',
        title: httpError.name,
        status,
        // Server-side failures never echo the thrown message to clients.
        detail:
            status === 500 && !isDev
                ? 'Internal Server Error'
                : httpError.message,
        ...extras,
    };

    if (isDev) {
        if (httpError.stack) {
            problem.stack = httpError.stack;
        }
        if (httpError.cause) {
            problem.cause =
                httpError.cause instanceof Error
                    ? {
                          message: httpError.cause.message,
                          stack: httpError.cause.stack,
                      }
                    : { message: String(httpError.cause) };
        }
    }

    return new Response(JSON.stringify(problem), {
        status,
        headers: { 'Content-Type': 'application/problem+json' },
    });
}
