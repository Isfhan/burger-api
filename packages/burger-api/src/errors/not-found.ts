import { HTTPError } from './http-error';

/**
 * 404 Not Found — thrown when a requested resource does not exist.
 *
 * @example
 * throw new NotFoundError();
 * throw new NotFoundError('User 42 not found');
 * throw new NotFoundError('User not found', { cause: dbError });
 */
export class NotFoundError extends HTTPError {
    override readonly name = 'NotFoundError';
    override readonly status = 404 as const;

    constructor(message?: string, options?: ErrorOptions) {
        super(404, message ?? 'Not Found', options);
    }
}
