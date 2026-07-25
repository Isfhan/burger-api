import { HTTPError } from './http-error';

/**
 * 405 Method Not Allowed — thrown when the HTTP method is not supported.
 *
 * @example
 * throw new MethodNotAllowedError();
 * throw new MethodNotAllowedError('PUT not supported on this resource');
 */
export class MethodNotAllowedError extends HTTPError {
    override readonly name = 'MethodNotAllowedError';
    override readonly status = 405 as const;

    constructor(message?: string, options?: ErrorOptions) {
        super(405, message ?? 'Method Not Allowed', options);
    }
}
