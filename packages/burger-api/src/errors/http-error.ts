import { resolveDebug } from '../utils/env.js';

/**
 * Base HTTP error class for BurgerAPI.
 *
 * All framework errors extend this; each subclass sets a static `status` and a
 * default `name`. The `onError` pipeline renders them as RFC 9457 Problem
 * Details. Subclasses: ValidationError (422), NotFoundError (404),
 * UnauthorizedError (401), ForbiddenError (403), MethodNotAllowedError (405).
 */

/** Options accepted by `HTTPError` and its subclasses. */
export type HTTPErrorOptions = ErrorOptions & {
    /** Response headers rendered with the error (e.g. `WWW-Authenticate`). */
    headers?: HeadersInit;
};

/**
 * Cross-copy brand. A second installed copy of this package has a different
 * `HTTPError` class, so `instanceof` is false even for a genuine error —
 * ecosystem plugins import `burger-api` themselves and can resolve to another
 * copy of the framework. `Symbol.for` is registry-global, so the brand still
 * identifies the error on both sides.
 */
const HTTP_ERROR_BRAND = Symbol.for('burger-api.http-error');

/** True for an `HTTPError` from any copy of this package. */
function isHTTPError(value: unknown): value is HTTPError {
    return (
        value !== null &&
        typeof value === 'object' &&
        (value as Record<symbol, unknown>)[HTTP_ERROR_BRAND] === true
    );
}

export class HTTPError extends Error {
    /** HTTP status code for this error. */
    readonly status: number;

    /** Response headers rendered with the error, when provided. */
    declare readonly headers?: HeadersInit;

    constructor(
        status: number,
        message: string,
        options?: HTTPErrorOptions
    ) {
        super(message, options);
        this.status = status;
        this.name = 'HTTPError';
        // Non-enumerable own brand (see HTTP_ERROR_BRAND).
        Object.defineProperty(this, HTTP_ERROR_BRAND, { value: true });
        if (options?.headers !== undefined) {
            this.headers = options.headers;
        }
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
 * Logs a 5xx error that no user `onError` hook handled. Server-side only:
 * one line of context plus the error and its stack.
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
 * Renders an error that escaped the request pipeline as RFC 9457 and logs it
 * when it is a server-side failure. Shared by the Bun adapter, the router's
 * pre-routing path and the WinterCG fetch entry, so uncaught errors render
 * identically on every runtime.
 */
export function renderUncaught(
    error: unknown,
    request: { method: string; url: string },
    debug?: boolean
): Response {
    const response = renderHTTPError(error, resolveDebug(debug));
    if (response.status >= 500) {
        logUnhandledError(request.method, request.url, error);
    }
    return response;
}

/**
 * Renders an `HTTPError` (or subclass) as an RFC 9457 Problem Details
 * response (`application/problem+json`).
 *
 * - Dev mode adds `stack` and the `cause` chain; production emits only
 *   `type`, `title`, `status`, `detail`.
 * - 500 responses always carry the fixed `Internal Server Error` detail — a
 *   thrown message is never echoed to clients. Other 5xx keep the message
 *   only for real `HTTPError` instances; a plain object with a `status`
 *   gets the bare status title.
 * - Non-HTTPError values are wrapped in `HTTPError(500)`.
 * - The status is clamped to 100-599 (integer); anything else renders as 500
 *   instead of escaping as a `RangeError`.
 *
 * @param error The error to render.
 * @param isDev Whether to include dev diagnostics (stack, cause).
 * @param extras Optional members merged into the problem body (e.g.
 * `{ errors }` for validation failures); spread last, so they can override
 * `title`/`detail`.
 */
export function renderHTTPError(
    error: unknown,
    isDev: boolean,
    extras?: Record<string, unknown>
): Response {
    const httpError =
        isHTTPError(error) ||
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

    // Clamp to a valid HTTP status; junk renders as 500, never throws a
    // `RangeError` from the `Response` constructor.
    const rawStatus = httpError.status;
    const status =
        Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599
            ? rawStatus
            : 500;

    // Server-side failures never echo the thrown message to clients. A real
    // HTTPError other than 500 is written by the developer, so it may; a
    // thrown object that only carries a `status` (often a library error)
    // may hold secrets, so its 5xx renders the bare status title.
    const hide =
        !isDev &&
        status >= 500 &&
        (status === 500 || !isHTTPError(error));
    const genericTitle = STATUS_TITLES[status] ?? 'Internal Server Error';

    const problem: Record<string, unknown> = {
        type: 'about:blank',
        // RFC 9457: the title is the status phrase, not the class name.
        title: hide
            ? genericTitle
            : (STATUS_TITLES[status] ?? httpError.name ?? 'Error'),
        status,
        detail: hide ? genericTitle : httpError.message,
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

    // Caller-supplied headers come from real HTTPError instances only; a
    // duck-typed thrown object must not inject response headers. The brand
    // makes this work across copies of the package.
    const headers = new Headers(
        isHTTPError(error) ? error.headers : undefined
    );
    // RFC 9457 media type is set last so it always wins.
    headers.set('Content-Type', 'application/problem+json');

    return new Response(JSON.stringify(problem), { status, headers });
}
