import { describe, it, expect } from 'bun:test';
import { HTTPError, renderHTTPError } from '../../src/errors/http-error';
import { NotFoundError } from '../../src/errors/not-found';
import { UnauthorizedError } from '../../src/errors/unauthorized';
import { ForbiddenError } from '../../src/errors/forbidden';
import { MethodNotAllowedError } from '../../src/errors/method-not-allowed';
import { ValidationError } from '../../src/validation/error';

// ─────────────────────────────────────────────────────
// HTTPError (base)
// ─────────────────────────────────────────────────────

describe('HTTPError', () => {
    it('constructs with status and message', () => {
        const err = new HTTPError(418, "I'm a teapot");
        expect(err.status).toBe(418);
        expect(err.message).toBe("I'm a teapot");
        expect(err.name).toBe('HTTPError');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(HTTPError);
    });

    it('accepts a cause option', () => {
        const cause = new Error('downstream');
        const err = new HTTPError(502, 'Bad Gateway', { cause });
        expect(err.cause).toBe(cause);
    });
});

// ─────────────────────────────────────────────────────
// NotFoundError
// ─────────────────────────────────────────────────────

describe('NotFoundError', () => {
    it('has status 404 and default message', () => {
        const err = new NotFoundError();
        expect(err.status).toBe(404);
        expect(err.message).toBe('Not Found');
        expect(err.name).toBe('NotFoundError');
        expect(err).toBeInstanceOf(HTTPError);
        expect(err).toBeInstanceOf(Error);
    });

    it('accepts a custom message', () => {
        const err = new NotFoundError('User 42 not found');
        expect(err.message).toBe('User 42 not found');
    });

    it('accepts a cause', () => {
        const cause = new Error('db error');
        const err = new NotFoundError('Record missing', { cause });
        expect(err.cause).toBe(cause);
    });

    it('is importable', () => {
        expect(new NotFoundError()).toBeInstanceOf(HTTPError);
    });
});

// ─────────────────────────────────────────────────────
// UnauthorizedError
// ─────────────────────────────────────────────────────

describe('UnauthorizedError', () => {
    it('has status 401 and default message', () => {
        const err = new UnauthorizedError();
        expect(err.status).toBe(401);
        expect(err.message).toBe('Unauthorized');
        expect(err.name).toBe('UnauthorizedError');
        expect(err).toBeInstanceOf(HTTPError);
    });

    it('accepts a custom message', () => {
        const err = new UnauthorizedError('Invalid token');
        expect(err.message).toBe('Invalid token');
    });

    it('accepts a cause', () => {
        const cause = new Error('jwt expired');
        const err = new UnauthorizedError('Token expired', { cause });
        expect(err.cause).toBe(cause);
    });

    it('is importable', () => {
        expect(new UnauthorizedError()).toBeInstanceOf(HTTPError);
    });
});

// ─────────────────────────────────────────────────────
// ForbiddenError
// ─────────────────────────────────────────────────────

describe('ForbiddenError', () => {
    it('has status 403 and default message', () => {
        const err = new ForbiddenError();
        expect(err.status).toBe(403);
        expect(err.message).toBe('Forbidden');
        expect(err.name).toBe('ForbiddenError');
        expect(err).toBeInstanceOf(HTTPError);
    });

    it('accepts a custom message', () => {
        const err = new ForbiddenError('Admin only');
        expect(err.message).toBe('Admin only');
    });

    it('is importable', () => {
        expect(new ForbiddenError()).toBeInstanceOf(HTTPError);
    });
});

// ─────────────────────────────────────────────────────
// MethodNotAllowedError
// ─────────────────────────────────────────────────────

describe('MethodNotAllowedError', () => {
    it('has status 405 and default message', () => {
        const err = new MethodNotAllowedError();
        expect(err.status).toBe(405);
        expect(err.message).toBe('Method Not Allowed');
        expect(err.name).toBe('MethodNotAllowedError');
        expect(err).toBeInstanceOf(HTTPError);
    });

    it('accepts a custom message', () => {
        const err = new MethodNotAllowedError('PUT not supported');
        expect(err.message).toBe('PUT not supported');
    });

    it('is importable', () => {
        expect(new MethodNotAllowedError()).toBeInstanceOf(HTTPError);
    });
});

// ─────────────────────────────────────────────────────
// renderHTTPError
// ─────────────────────────────────────────────────────

describe('renderHTTPError', () => {
    it('renders an HTTPError as RFC 9457 in production (isDev=false)', async () => {
        const err = new NotFoundError('User 42 not found');
        const res = renderHTTPError(err, false);
        expect(res.status).toBe(404);
        expect(res.headers.get('content-type')).toBe('application/problem+json');

        const body = await res.json();
        expect(body.type).toBe('about:blank');
        expect(body.title).toBe('NotFoundError');
        expect(body.status).toBe(404);
        expect(body.detail).toBe('User 42 not found');
        expect(body.stack).toBeUndefined();
        expect(body.cause).toBeUndefined();
    });

    it('renders an HTTPError as RFC 9457 in dev mode (isDev=true)', async () => {
        const err = new ForbiddenError('Nope');
        const res = renderHTTPError(err, true);
        expect(res.status).toBe(403);

        const body = await res.json();
        expect(body.type).toBe('about:blank');
        expect(body.title).toBe('ForbiddenError');
        expect(body.status).toBe(403);
        expect(body.detail).toBe('Nope');
        expect(body.stack).toBeDefined();
        expect(typeof body.stack).toBe('string');
    });

    it('wraps unknown errors as HTTPError(500) in production', async () => {
        const res = renderHTTPError(new Error('something broke'), false);
        expect(res.status).toBe(500);
        expect(res.headers.get('content-type')).toBe('application/problem+json');

        const body = await res.json();
        expect(body.type).toBe('about:blank');
        expect(body.title).toBe('HTTPError');
        expect(body.status).toBe(500);
        expect(body.detail).toBe('Internal Server Error');
        expect(body.stack).toBeUndefined();
    });

    it('wraps unknown errors in dev mode with cause chain', async () => {
        const original = new Error('original');
        const res = renderHTTPError(original, true);
        const body = await res.json();
        expect(body.status).toBe(500);
        expect(body.stack).toBeDefined();
        expect(body.cause).toBeDefined();
        expect(body.cause.message).toBe('original');
    });

    it('renders HTTPError with cause in dev mode', async () => {
        const cause = new Error('db timeout');
        const err = new HTTPError(503, 'Service Unavailable', { cause });
        const res = renderHTTPError(err, true);
        const body = await res.json();
        expect(body.status).toBe(503);
        expect(body.cause).toBeDefined();
        expect(body.cause.message).toBe('db timeout');
        expect(body.cause.stack).toBeDefined();
    });

    it('renders non-Error cause values in dev mode', async () => {
        const err = new HTTPError(500, 'fail', { cause: 'string cause' });
        const res = renderHTTPError(err, true);
        const body = await res.json();
        expect(body.cause).toEqual({ message: 'string cause' });
    });
});

// ─────────────────────────────────────────────────────
// ValidationError (backward compat)
// ─────────────────────────────────────────────────────

describe('ValidationError', () => {
    it('has status 422 and structured issues', () => {
        const issues = [{ path: ['body', 'name'], message: 'required', code: 'required' }];
        const err = new ValidationError('body', issues);
        expect(err.status).toBe(422);
        expect(err.slot).toBe('body');
        expect(err.issues).toEqual(issues);
        expect(err).toBeInstanceOf(HTTPError);
    });

    it('toResponse renders with errors slot in problem+json format', async () => {
        const issues = [{ path: ['name'], message: 'required', code: 'required' }];
        const err = new ValidationError('body', issues);
        const res = err.toResponse(false);
        expect(res.status).toBe(422);
        expect(res.headers.get('content-type')).toBe('application/problem+json');

        const body = await res.json();
        expect(body.type).toBe('about:blank');
        expect(body.title).toBe('Validation Error');
        expect(body.status).toBe(422);
        expect(body.errors).toBeDefined();
        expect(body.errors.body).toBeDefined();
        expect(body.errors.body[0].message).toBe('required');
    });

    it('toResponse groups by errorsBySlot when provided', async () => {
        const issues = [{ path: ['q'], message: 'invalid', code: 'invalid_string' }];
        const err = new ValidationError('query', issues, {
            errorsBySlot: { query: issues, body: [{ path: ['name'], message: 'required', code: 'required' }] },
        });
        const res = err.toResponse(false);
        const body = await res.json();
        expect(body.errors.query).toBeDefined();
        expect(body.errors.body).toBeDefined();
    });
});

// ─────────────────────────────────────────────────────
// Exports from package root
// ─────────────────────────────────────────────────────

describe('package exports', () => {
    it('exports all error classes from burger-api', async () => {
        const barrel = await import('../../src/index');
        expect(barrel.HTTPError).toBeDefined();
        expect(barrel.ValidationError).toBeDefined();
        expect(barrel.NotFoundError).toBeDefined();
        expect(barrel.UnauthorizedError).toBeDefined();
        expect(barrel.ForbiddenError).toBeDefined();
        expect(barrel.MethodNotAllowedError).toBeDefined();
        expect(barrel.renderHTTPError).toBeDefined();
    });
});
