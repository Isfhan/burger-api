import { HTTPError } from './http-error.js';
import type { HTTPErrorOptions } from './http-error.js';

/**
 * 403 Forbidden — thrown when the user is authenticated but lacks permission.
 *
 * @example
 * throw new ForbiddenError();
 * throw new ForbiddenError('Insufficient permissions');
 * throw new ForbiddenError('Admin only', { cause: roleError });
 */
export class ForbiddenError extends HTTPError {
    override readonly name = 'ForbiddenError';
    override readonly status = 403 as const;

    constructor(message?: string, options?: HTTPErrorOptions) {
        super(403, message ?? 'Forbidden', options);
    }
}
