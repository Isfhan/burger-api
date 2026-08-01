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
 * - In production, only `type`, `title`, `status`, `detail` are emitted.
 * - Unknown (non-HTTPError) errors are wrapped in `HTTPError(500)`.
 *
 * @param error  The error to render.
 * @param isDev  Whether to include dev diagnostics (stack, cause).
 */
export function renderHTTPError(error: unknown, isDev: boolean): Response {
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

    const problem: Record<string, unknown> = {
        type: 'about:blank',
        title: httpError.name,
        status: httpError.status,
        detail: httpError.message,
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
        status: httpError.status,
        headers: { 'Content-Type': 'application/problem+json' },
    });
}
