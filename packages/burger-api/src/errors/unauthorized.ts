import { HTTPError } from './http-error';

/**
 * 401 Unauthorized — thrown when authentication is missing or invalid.
 *
 * @example
 * throw new UnauthorizedError();
 * throw new UnauthorizedError('Invalid token');
 * throw new UnauthorizedError('Token expired', { cause: jwtError });
 */
export class UnauthorizedError extends HTTPError {
    override readonly name = 'UnauthorizedError';
    override readonly status = 401 as const;

    constructor(message?: string, options?: ErrorOptions) {
        super(401, message ?? 'Unauthorized', options);
    }
}
