/**
 * The base HTTP error class for BurgerAPI (phase3 §14).
 *
 * All framework error classes extend this. Each subclass sets a static
 * `status` code. The `onError` pipeline catches these and renders
 * RFC 9457 Problem Details by default.
 *
 * Phase 6 expands the hierarchy (NotFoundError, UnauthorizedError, etc.).
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
