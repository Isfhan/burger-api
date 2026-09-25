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
 * HTTP status reason phrases (RFC 9110) used as the Problem Details `title`.
 * Unlisted codes fall back to the error class name.
 */
const STATUS_TITLES: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    411: 'Length Required',
    412: 'Precondition Failed',
    413: 'Content Too Large',
    414: 'URI Too Long',
    415: 'Unsupported Media Type',
    416: 'Range Not Satisfiable',
    417: 'Expectation Failed',
    418: "I'm a teapot",
    422: 'Unprocessable Content',
    423: 'Locked',
    424: 'Failed Dependency',
    425: 'Too Early',
    426: 'Upgrade Required',
    428: 'Precondition Required',
    429: 'Too Many Requests',
    431: 'Request Header Fields Too Large',
    451: 'Unavailable For Legal Reasons',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
    505: 'HTTP Version Not Supported',
};

/**
 * Logs an error that produced a 5xx response and was not handled by any
 * user `onError` hook — server-side only (clients get a generic body in
 * production). One line of context plus the error (with its stack).
 */
export function logUnhandledError(
    method: string,
    url: string,
    error: unknown
): void {
    let path = url;
    try {
        path = new URL(url).pathname;
    } catch {
        // Not an absolute URL — log it verbatim.
    }
    console.error(`[burger-api] Unhandled error in ${method} ${path}:`, error);
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
        // RFC 9457: the title is the status phrase, not the class name.
        title: STATUS_TITLES[status] ?? httpError.name ?? 'Error',
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
